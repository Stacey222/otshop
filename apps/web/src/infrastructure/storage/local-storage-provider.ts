import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, link, lstat, mkdir, open, realpath, stat, unlink } from "node:fs/promises";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";

import type {
  StoragePromotion,
  StorageProvider,
  StoredObjectStat,
  TemporaryStorageObject,
} from "@/application/media/storage-provider";

const managedPrefixes = new Set([
  "diagnostics",
  "original",
  "processed",
  "temporary",
  "thumbnails",
]);

export class UnsafeStorageConfigurationError extends Error {
  override readonly name = "UnsafeStorageConfigurationError";
}

const isMissing = (error: unknown): boolean =>
  typeof error === "object" && error !== null && Reflect.get(error, "code") === "ENOENT";

const isAlreadyPresent = (error: unknown): boolean =>
  typeof error === "object" && error !== null && Reflect.get(error, "code") === "EEXIST";

export class LocalStorageProvider implements StorageProvider {
  private readonly configuredRoot: string;
  private managedRoot: string | undefined;
  private initialization: Promise<void> | undefined;

  constructor(storageRoot: string) {
    this.configuredRoot = resolve(storageRoot);
    if (this.configuredRoot === parse(this.configuredRoot).root) {
      throw new UnsafeStorageConfigurationError("Storage root cannot be a filesystem root");
    }
  }

  private async initialize(): Promise<void> {
    this.initialization ??= this.initializeOnce();
    await this.initialization;
    const root = await lstat(this.root());
    if (!root.isDirectory() || root.isSymbolicLink()) {
      throw new UnsafeStorageConfigurationError("Storage root became unsafe");
    }
  }

  private async initializeOnce(): Promise<void> {
    await mkdir(this.configuredRoot, { recursive: true });
    const configured = await lstat(this.configuredRoot);
    if (!configured.isDirectory() || configured.isSymbolicLink()) {
      throw new UnsafeStorageConfigurationError("Storage root must be a real directory");
    }
    const canonical = await realpath(this.configuredRoot);
    if (canonical === parse(canonical).root) {
      throw new UnsafeStorageConfigurationError("Storage root resolves to a filesystem root");
    }
    this.managedRoot = canonical;
    await this.ensureDirectory(["temporary"]);
    await this.ensureDirectory(["original"]);
  }

  private root(): string {
    if (this.managedRoot === undefined) throw new Error("Storage provider is not initialized");
    return this.managedRoot;
  }

  private keySegments(key: string): readonly string[] {
    if (key.length === 0 || key.length > 1_024 || key.includes("\\") || isAbsolute(key)) {
      throw new UnsafeStorageConfigurationError("Storage key is invalid");
    }
    const segments = key.split("/");
    if (
      segments.length < 2 ||
      !managedPrefixes.has(segments[0] ?? "") ||
      segments.some(
        (segment) =>
          segment.length === 0 ||
          segment === "." ||
          segment === ".." ||
          !/^[A-Za-z0-9._-]+$/u.test(segment),
      )
    ) {
      throw new UnsafeStorageConfigurationError("Storage key is invalid");
    }
    return segments;
  }

  private resolveKey(key: string): { readonly path: string; readonly segments: readonly string[] } {
    const segments = this.keySegments(key);
    const path = resolve(this.root(), ...segments);
    const relation = relative(this.root(), path);
    if (relation.startsWith(`..${sep}`) || relation === ".." || isAbsolute(relation)) {
      throw new UnsafeStorageConfigurationError("Storage key escapes the managed root");
    }
    return { path, segments };
  }

  private async ensureDirectory(segments: readonly string[]): Promise<void> {
    let current = this.root();
    for (const segment of segments) {
      current = join(current, segment);
      await mkdir(current).catch((error: unknown) => {
        if (!isAlreadyPresent(error)) throw error;
      });
      const entry = await lstat(current);
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new UnsafeStorageConfigurationError("Managed storage directory is unsafe");
      }
    }
  }

  private async assertDirectories(segments: readonly string[]): Promise<void> {
    let current = this.root();
    for (const segment of segments) {
      current = join(current, segment);
      const entry = await lstat(current);
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new UnsafeStorageConfigurationError("Managed storage directory is unsafe");
      }
    }
  }

  private async assertRegularFile(path: string): Promise<void> {
    const entry = await lstat(path);
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new UnsafeStorageConfigurationError("Stored object is not a regular file");
    }
  }

  async writeTemporary(source: AsyncIterable<Uint8Array>): Promise<TemporaryStorageObject> {
    await this.initialize();
    await this.ensureDirectory(["temporary"]);
    const key = `temporary/${randomUUID()}.part`;
    const target = this.resolveKey(key).path;
    const handle = await open(target, "wx", 0o600);
    let completed = false;
    try {
      for await (const chunk of source) {
        let offset = 0;
        while (offset < chunk.byteLength) {
          const result = await handle.write(chunk, offset, chunk.byteLength - offset);
          offset += result.bytesWritten;
        }
      }
      await handle.sync();
      completed = true;
      return { key };
    } finally {
      await handle.close();
      if (!completed) await unlink(target).catch(() => undefined);
    }
  }

  async promoteTemporary(temporaryKey: string, finalKey: string): Promise<StoragePromotion> {
    await this.initialize();
    if (
      !temporaryKey.startsWith("temporary/") ||
      (!finalKey.startsWith("original/") && !finalKey.startsWith("thumbnails/"))
    ) {
      throw new UnsafeStorageConfigurationError("Storage promotion keys are invalid");
    }
    const temporary = this.resolveKey(temporaryKey);
    const final = this.resolveKey(finalKey);
    await this.assertDirectories(temporary.segments.slice(0, -1));
    await this.assertRegularFile(temporary.path);
    await this.ensureDirectory(final.segments.slice(0, -1));
    try {
      await link(temporary.path, final.path);
      try {
        await chmod(final.path, 0o400);
      } catch (error) {
        await unlink(final.path).catch(() => undefined);
        throw error;
      }
      await unlink(temporary.path);
      return "CREATED";
    } catch (error) {
      if (!isAlreadyPresent(error)) throw error;
      await this.assertRegularFile(final.path);
      await unlink(temporary.path);
      return "EXISTS";
    }
  }

  async openRead(key: string): Promise<AsyncIterable<Uint8Array>> {
    await this.initialize();
    const resolved = this.resolveKey(key);
    await this.assertDirectories(resolved.segments.slice(0, -1));
    const target = resolved.path;
    await this.assertRegularFile(target);
    return createReadStream(target);
  }

  async stat(key: string): Promise<StoredObjectStat | null> {
    await this.initialize();
    const resolved = this.resolveKey(key);
    try {
      await this.assertDirectories(resolved.segments.slice(0, -1));
      const target = resolved.path;
      await this.assertRegularFile(target);
      const value = await stat(target);
      return { sizeBytes: value.size };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.stat(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    await this.initialize();
    const resolved = this.resolveKey(key);
    try {
      await this.assertDirectories(resolved.segments.slice(0, -1));
      const target = resolved.path;
      await this.assertRegularFile(target);
      await unlink(target);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
}
