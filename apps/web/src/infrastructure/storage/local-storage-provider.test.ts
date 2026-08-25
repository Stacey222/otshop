import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, symlink } from "node:fs/promises";
import { join, parse, relative, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { mediaChunks } from "@/application/media/media-test-fixtures";

import { LocalStorageProvider, UnsafeStorageConfigurationError } from "./local-storage-provider";

const testParent = resolve("storage", "test-runs");
const roots: string[] = [];

const testRoot = (): string => {
  const root = join(testParent, randomUUID());
  roots.push(root);
  return root;
};

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root === undefined) continue;
    const relation = relative(testParent, root);
    if (relation.length === 0 || relation.startsWith("..")) {
      throw new Error("Unsafe test storage cleanup target");
    }
    await rm(root, { recursive: true, force: true });
  }
});

describe("LocalStorageProvider", () => {
  it("rejects a filesystem root and cross-platform traversal keys", async () => {
    expect(() => new LocalStorageProvider(parse(resolve(".")).root)).toThrow(
      UnsafeStorageConfigurationError,
    );
    const provider = new LocalStorageProvider(testRoot());
    for (const key of [
      "../evil",
      "..\\evil",
      "C:\\evil",
      "\\\\server\\share",
      "original/../evil.mp4",
      "/absolute/evil.mp4",
    ]) {
      await expect(provider.stat(key)).rejects.toBeInstanceOf(
        UnsafeStorageConfigurationError,
      );
    }
  });

  it("promotes with atomic create-without-overwrite semantics", async () => {
    const provider = new LocalStorageProvider(testRoot());
    const first = await provider.writeTemporary(mediaChunks(Uint8Array.from([1, 2, 3])));
    const second = await provider.writeTemporary(mediaChunks(Uint8Array.from([9, 9, 9])));
    const finalKey = `original/workspace/018f1000-0000-7000-8000-000000000001/media/${"a".repeat(64)}.mp4`;

    await expect(provider.promoteTemporary(first.key, finalKey)).resolves.toBe("CREATED");
    await expect(provider.promoteTemporary(second.key, finalKey)).resolves.toBe("EXISTS");
    const chunks: number[] = [];
    for await (const chunk of await provider.openRead(finalKey)) chunks.push(...chunk);
    expect(chunks).toEqual([1, 2, 3]);
    await provider.delete(finalKey);
    await expect(provider.exists(finalKey)).resolves.toBe(false);
  });

  it("promotes one immutable thumbnail without allowing unrelated final prefixes", async () => {
    const provider = new LocalStorageProvider(testRoot());
    const temporary = await provider.writeTemporary(mediaChunks(Uint8Array.from([0xff, 0xd8])));
    const thumbnailKey =
      "thumbnails/workspace/018f1000-0000-7000-8000-000000000001/media/018f1000-0000-7000-8000-000000000010.jpg";
    await expect(provider.promoteTemporary(temporary.key, thumbnailKey)).resolves.toBe("CREATED");
    await expect(provider.exists(thumbnailKey)).resolves.toBe(true);

    const unsafe = await provider.writeTemporary(mediaChunks(Uint8Array.from([1])));
    await expect(provider.promoteTemporary(unsafe.key, "processed/output.mp4")).rejects.toBeInstanceOf(
      UnsafeStorageConfigurationError,
    );
    await provider.delete(unsafe.key);
    await provider.delete(thumbnailKey);
  });

  it("removes partial temporary data when the upload stream fails", async () => {
    const root = testRoot();
    const provider = new LocalStorageProvider(root);
    const interrupted = async function* () {
      yield Uint8Array.from([1, 2, 3]);
      throw new Error("interrupted upload");
    };

    await expect(provider.writeTemporary(interrupted())).rejects.toThrow("interrupted upload");
    await expect(readdir(join(root, "temporary"))).resolves.toEqual([]);
  });

  it.skipIf(process.platform === "win32")(
    "rejects a managed directory replaced by a symbolic link",
    async () => {
      const root = testRoot();
      const provider = new LocalStorageProvider(root);
      const temporary = await provider.writeTemporary(mediaChunks(Uint8Array.from([1])));
      await provider.delete(temporary.key);
      const outside = join(testParent, `outside-${randomUUID()}`);
      roots.push(outside);
      await mkdir(outside, { recursive: true });
      await rm(join(root, "original"), { recursive: true });
      await symlink(outside, join(root, "original"), "dir");

      const staged = await provider.writeTemporary(mediaChunks(Uint8Array.from([1])));
      await expect(
        provider.promoteTemporary(staged.key, `original/media/${"b".repeat(64)}.mp4`),
      ).rejects.toBeInstanceOf(UnsafeStorageConfigurationError);
    },
  );
});
