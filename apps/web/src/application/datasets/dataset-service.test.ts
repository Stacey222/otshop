import { ROLE_PERMISSIONS, type AuthenticatedContext } from "@otshop/shared";
import { describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";

import {
  DatasetArchivedError,
  DatasetConflictError,
  DatasetDuplicateMediaError,
  DatasetItemLimitError,
  DatasetItemNotFoundError,
  DatasetMediaNotReadyError,
  DatasetNotFoundError,
  DatasetPersistenceFailureError,
  InvalidDatasetOrderError,
  InvalidDatasetPaginationError,
} from "./dataset-errors";
import type { DatasetItemRecord, DatasetRecord, DatasetRepositoryPort } from "./dataset-repository";
import { DatasetService } from "./dataset-service";

const workspaceA = "01941f29-7c00-7000-8000-000000000001";
const workspaceB = "01941f29-7c00-7000-8000-000000000002";
const userId = "01941f29-7c00-7000-8000-000000000003";
const sessionId = "01941f29-7c00-7000-8000-000000000004";
const requestId = "01941f29-7c00-7000-8000-000000000005";
const datasetId = "01941f29-7c00-7000-8000-000000000010";
const itemA = "01941f29-7c00-7000-8000-000000000011";
const itemB = "01941f29-7c00-7000-8000-000000000012";
const itemC = "01941f29-7c00-7000-8000-000000000013";
const mediaReady = "01941f29-7c00-7000-8000-000000000020";
const mediaReadyB = "01941f29-7c00-7000-8000-000000000021";
const mediaIngested = "01941f29-7c00-7000-8000-000000000022";
const mediaCrossWorkspace = "01941f29-7c00-7000-8000-000000000023";
const mediaInspecting = "01941f29-7c00-7000-8000-000000000024";
const mediaRejected = "01941f29-7c00-7000-8000-000000000025";
const mediaInspectionFailed = "01941f29-7c00-7000-8000-000000000026";
const mediaMissing = "01941f29-7c00-7000-8000-000000000027";
const now = new Date("2026-08-25T06:00:00.000Z");

const logger: ApplicationLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  withContext() {
    return this;
  },
};

const context = (
  role: AuthenticatedContext["role"] = "ADMIN",
  workspaceId = workspaceA,
): AuthenticatedContext => ({
  userId,
  sessionId,
  workspaceId,
  role,
  permissions: ROLE_PERMISSIONS[role],
});

const record = (overrides: Partial<DatasetRecord> = {}): DatasetRecord => ({
  id: datasetId,
  workspaceId: workspaceA,
  name: "Dataset A",
  description: null,
  status: "ACTIVE",
  createdByUserId: userId,
  createdAt: now,
  updatedAt: now,
  version: 1,
  itemCount: 0,
  ...overrides,
});

const mediaSummary = (status: string) => ({
  status,
  mimeType: "video/mp4",
  durationMs: 10_000n,
  width: 1920,
  height: 1080,
  thumbnailAvailable: false,
});

class MemoryDatasetRepository implements DatasetRepositoryPort {
  datasets = new Map<string, DatasetRecord>([[datasetId, record()]]);
  items = new Map<string, DatasetItemRecord>();
  media = new Map([
    [mediaReady, { workspaceId: workspaceA, status: "READY" }],
    [mediaReadyB, { workspaceId: workspaceA, status: "READY" }],
    [mediaIngested, { workspaceId: workspaceA, status: "INGESTED" }],
    [mediaInspecting, { workspaceId: workspaceA, status: "INSPECTING" }],
    [mediaRejected, { workspaceId: workspaceA, status: "REJECTED" }],
    [mediaInspectionFailed, { workspaceId: workspaceA, status: "INSPECTION_FAILED" }],
    [mediaCrossWorkspace, { workspaceId: workspaceB, status: "READY" }],
  ]);
  fail = false;
  observedLimit = 0;

  private dataset(workspaceId: string, id: string): DatasetRecord | null {
    const value = this.datasets.get(id);
    return value?.workspaceId === workspaceId ? value : null;
  }

  private state(workspaceId: string, id: string, expectedVersion: number) {
    const dataset = this.dataset(workspaceId, id);
    if (dataset === null) return { dataset: null, state: "NOT_FOUND" as const };
    if (dataset.status === "ARCHIVED") return { dataset, state: "ARCHIVED" as const };
    if (dataset.version !== expectedVersion) return { dataset, state: "CONFLICT" as const };
    return { dataset, state: null };
  }

  private updated(dataset: DatasetRecord, changes: Partial<DatasetRecord> = {}): DatasetRecord {
    const next = { ...dataset, ...changes, version: dataset.version + 1, updatedAt: now };
    this.datasets.set(next.id, next);
    return next;
  }

  private item(id: string, mediaAssetId: string, position: number, captionOverride: string | null) {
    return {
      id,
      workspaceId: workspaceA,
      datasetId,
      mediaAssetId,
      position,
      captionOverride,
      createdAt: now,
      updatedAt: now,
      media: mediaSummary("READY"),
    } satisfies DatasetItemRecord;
  }

  async create(input: Parameters<DatasetRepositoryPort["create"]>[0]) {
    if (this.fail) throw new Error("database unavailable");
    if (
      [...this.datasets.values()].some(
        (value) => value.workspaceId === input.workspaceId && value.name === input.name,
      )
    ) {
      return { state: "NAME_CONFLICT" } as const;
    }
    const dataset = record({
      ...input,
      status: "ACTIVE",
      itemCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    this.datasets.set(input.id, dataset);
    return { state: "CREATED", dataset } as const;
  }

  async findByWorkspaceAndId(workspaceId: string, id: string) {
    if (this.fail) throw new Error("database unavailable");
    return this.dataset(workspaceId, id);
  }

  async list(input: Parameters<DatasetRepositoryPort["list"]>[0]) {
    if (this.fail) throw new Error("database unavailable");
    this.observedLimit = input.limit;
    const values = [...this.datasets.values()]
      .filter((value) => value.workspaceId === input.workspaceId)
      .filter((value) => input.includeArchived || value.status === "ACTIVE")
      .sort((left, right) => right.id.localeCompare(left.id));
    return { datasets: values.slice(0, input.limit), hasMore: values.length > input.limit };
  }

  async listItems(input: Parameters<DatasetRepositoryPort["listItems"]>[0]) {
    if (this.fail) throw new Error("database unavailable");
    const values = [...this.items.values()]
      .filter(
        (item) => item.workspaceId === input.workspaceId && item.datasetId === input.datasetId,
      )
      .filter((item) => input.after === undefined || item.position > input.after.position)
      .sort((left, right) => left.position - right.position);
    return { items: values.slice(0, input.limit), hasMore: values.length > input.limit };
  }

  async updateMetadata(input: Parameters<DatasetRepositoryPort["updateMetadata"]>[0]) {
    if (this.fail) throw new Error("database unavailable");
    const checked = this.state(input.workspaceId, input.datasetId, input.expectedVersion);
    if (checked.state !== null) return { state: checked.state } as const;
    if (
      input.name !== undefined &&
      [...this.datasets.values()].some(
        (value) =>
          value.id !== input.datasetId &&
          value.workspaceId === input.workspaceId &&
          value.name === input.name,
      )
    ) {
      return { state: "NAME_CONFLICT" } as const;
    }
    return {
      state: "UPDATED",
      dataset: this.updated(checked.dataset!, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
      }),
    } as const;
  }

  async archive(input: Parameters<DatasetRepositoryPort["archive"]>[0]) {
    if (this.fail) throw new Error("database unavailable");
    const checked = this.state(input.workspaceId, input.datasetId, input.expectedVersion);
    if (checked.state !== null) return { state: checked.state } as const;
    return {
      state: "ARCHIVED",
      dataset: this.updated(checked.dataset!, { status: "ARCHIVED" }),
    } as const;
  }

  async addItem(input: Parameters<DatasetRepositoryPort["addItem"]>[0]) {
    if (this.fail) throw new Error("database unavailable");
    const checked = this.state(input.workspaceId, input.datasetId, input.expectedVersion);
    if (checked.state !== null) return { state: checked.state } as const;
    const media = this.media.get(input.mediaAssetId);
    if (media?.workspaceId !== input.workspaceId || media.status !== "READY")
      return { state: "MEDIA_NOT_READY" } as const;
    if (
      [...this.items.values()].some(
        (item) => item.datasetId === input.datasetId && item.mediaAssetId === input.mediaAssetId,
      )
    )
      return { state: "DUPLICATE_MEDIA" } as const;
    if (checked.dataset!.itemCount >= input.maximumItems) return { state: "ITEM_LIMIT" } as const;
    const item = this.item(
      input.id,
      input.mediaAssetId,
      checked.dataset!.itemCount,
      input.captionOverride,
    );
    this.items.set(item.id, item);
    const dataset = this.updated(checked.dataset!, { itemCount: checked.dataset!.itemCount + 1 });
    return { state: "ADDED", dataset, item } as const;
  }

  async updateItem(input: Parameters<DatasetRepositoryPort["updateItem"]>[0]) {
    if (this.fail) throw new Error("database unavailable");
    const checked = this.state(input.workspaceId, input.datasetId, input.expectedVersion);
    if (checked.state !== null) return { state: checked.state } as const;
    const current = this.items.get(input.itemId);
    if (current?.datasetId !== input.datasetId || current.workspaceId !== input.workspaceId)
      return { state: "ITEM_NOT_FOUND" } as const;
    const item = { ...current, captionOverride: input.captionOverride, updatedAt: now };
    this.items.set(item.id, item);
    return { state: "UPDATED", dataset: this.updated(checked.dataset!), item } as const;
  }

  async removeItem(input: Parameters<DatasetRepositoryPort["removeItem"]>[0]) {
    if (this.fail) throw new Error("database unavailable");
    const checked = this.state(input.workspaceId, input.datasetId, input.expectedVersion);
    if (checked.state !== null) return { state: checked.state } as const;
    const current = this.items.get(input.itemId);
    if (current?.datasetId !== input.datasetId || current.workspaceId !== input.workspaceId)
      return { state: "ITEM_NOT_FOUND" } as const;
    this.items.delete(input.itemId);
    const remaining = [...this.items.values()]
      .filter((item) => item.datasetId === input.datasetId)
      .sort((left, right) => left.position - right.position);
    remaining.forEach((item, position) => this.items.set(item.id, { ...item, position }));
    return {
      state: "REMOVED",
      dataset: this.updated(checked.dataset!, { itemCount: checked.dataset!.itemCount - 1 }),
    } as const;
  }

  async reorder(input: Parameters<DatasetRepositoryPort["reorder"]>[0]) {
    if (this.fail) throw new Error("database unavailable");
    const checked = this.state(input.workspaceId, input.datasetId, input.expectedVersion);
    if (checked.state !== null) return { state: checked.state } as const;
    const existing = [...this.items.values()].filter(
      (item) => item.datasetId === input.datasetId && item.workspaceId === input.workspaceId,
    );
    if (
      input.itemIds.length !== existing.length ||
      new Set(input.itemIds).size !== input.itemIds.length ||
      input.itemIds.some((id) => !existing.some((item) => item.id === id))
    )
      return { state: "INVALID_ORDER" } as const;
    const items = input.itemIds.map((id, position) => {
      const item = { ...this.items.get(id)!, position };
      this.items.set(id, item);
      return item;
    });
    return { state: "REORDERED", dataset: this.updated(checked.dataset!), items } as const;
  }
}

const setup = () => {
  const repository = new MemoryDatasetRepository();
  const service = new DatasetService(repository, logger, () => now);
  return { repository, service };
};

const create = (service: DatasetService, body: unknown = { name: "New dataset" }) =>
  service.create({ context: context(), requestId, body });

describe("DatasetService", () => {
  it("creates normalized bounded datasets and rejects invalid or conflicting names", async () => {
    const { service } = setup();
    await expect(
      create(service, { name: "  New dataset  ", description: "  Notes  " }),
    ).resolves.toMatchObject({
      name: "New dataset",
      description: "Notes",
      status: "ACTIVE",
      version: 1,
    });
    await expect(create(service, { name: "   " })).rejects.toMatchObject({ name: "ZodError" });
    await expect(create(service, { name: "x".repeat(121) })).rejects.toMatchObject({
      name: "ZodError",
    });
    await expect(create(service, { name: "Dataset A" })).rejects.toBeInstanceOf(
      DatasetConflictError,
    );
  });

  it("allows canonical viewer reads but denies viewer writes and unknown contexts", async () => {
    const { service } = setup();
    await expect(service.list({ context: context("VIEWER") })).resolves.toMatchObject({
      datasets: [{ datasetId }],
    });
    await expect(
      service.create({ context: context("VIEWER"), requestId, body: { name: "Denied" } }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.list({
        context: {
          ...context("ADMIN"),
          permissions: ROLE_PERMISSIONS.ADMIN.filter(
            (permission) => permission !== "datasets.read",
          ),
        },
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.create({
        context: {
          ...context("ADMIN"),
          permissions: ROLE_PERMISSIONS.ADMIN.filter(
            (permission) => permission !== "datasets.write",
          ),
        },
        requestId,
        body: { name: "Missing permission" },
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.list({ context: { ...context(), role: "UNKNOWN" as never } }),
    ).rejects.toBeTruthy();
  });

  it("reads only the active workspace and validates null-like or malformed identifiers", async () => {
    const { service } = setup();
    await expect(service.get({ context: context(), datasetId })).resolves.toMatchObject({
      datasetId,
      items: [],
    });
    await expect(
      service.get({ context: context("ADMIN", workspaceB), datasetId }),
    ).rejects.toBeInstanceOf(DatasetNotFoundError);
    await expect(
      service.update({
        context: context("ADMIN", workspaceB),
        requestId,
        datasetId,
        body: { expectedVersion: 1, name: "Cross-workspace write" },
      }),
    ).rejects.toBeInstanceOf(DatasetNotFoundError);
    await expect(service.get({ context: context(), datasetId: "invalid" })).rejects.toBeInstanceOf(
      DatasetNotFoundError,
    );
    await expect(
      service.get({ context: context(), datasetId: undefined as unknown as string }),
    ).rejects.toBeInstanceOf(DatasetNotFoundError);
  });

  it("uses bounded pagination and rejects malformed pagination", async () => {
    const { repository, service } = setup();
    await service.list({ context: context() });
    expect(repository.observedLimit).toBe(25);
    await service.list({ context: context(), limit: "100" });
    expect(repository.observedLimit).toBe(100);
    await expect(service.list({ context: context(), limit: "101" })).rejects.toBeInstanceOf(
      InvalidDatasetPaginationError,
    );
    await expect(
      service.list({ context: context(), cursor: "not-a-valid-cursor" }),
    ).rejects.toBeInstanceOf(InvalidDatasetPaginationError);
    await expect(
      service.list({ context: context(), includeArchived: "yes" }),
    ).rejects.toBeInstanceOf(InvalidDatasetPaginationError);
  });

  it("updates metadata with optimistic versioning", async () => {
    const { service } = setup();
    await expect(
      service.update({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 1, name: "Renamed", description: "Description" },
      }),
    ).resolves.toMatchObject({ name: "Renamed", description: "Description", version: 2 });
    await expect(
      service.update({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 1, name: "Lost update" },
      }),
    ).rejects.toBeInstanceOf(DatasetConflictError);
    await expect(
      service.update({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 2, customFields: {} },
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });

  it("adds only READY same-workspace media and prevents duplicate media", async () => {
    const { service } = setup();
    const added = await service.addItem({
      context: context(),
      requestId,
      datasetId,
      body: { expectedVersion: 1, mediaAssetId: mediaReady, captionOverride: "Caption" },
    });
    expect(added).toMatchObject({
      dataset: { version: 2, itemCount: 1 },
      item: { position: 0, captionOverride: "Caption" },
    });
    await expect(
      service.addItem({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 2, mediaAssetId: mediaReady },
      }),
    ).rejects.toBeInstanceOf(DatasetDuplicateMediaError);
    for (const mediaAssetId of [
      mediaIngested,
      mediaInspecting,
      mediaRejected,
      mediaInspectionFailed,
      mediaMissing,
    ]) {
      await expect(
        service.addItem({
          context: context(),
          requestId,
          datasetId,
          body: { expectedVersion: 2, mediaAssetId },
        }),
      ).rejects.toBeInstanceOf(DatasetMediaNotReadyError);
    }
    await expect(
      service.addItem({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 2, mediaAssetId: mediaCrossWorkspace },
      }),
    ).rejects.toBeInstanceOf(DatasetMediaNotReadyError);
  });

  it("allows position 999 and rejects a 1001st item", async () => {
    const { repository, service } = setup();
    repository.datasets.set(datasetId, record({ itemCount: 999 }));
    await expect(
      service.addItem({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 1, mediaAssetId: mediaReady },
      }),
    ).resolves.toMatchObject({
      dataset: { itemCount: 1_000, version: 2 },
      item: { position: 999 },
    });
    await expect(
      service.addItem({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 2, mediaAssetId: mediaReadyB },
      }),
    ).rejects.toBeInstanceOf(DatasetItemLimitError);
  });

  it("bounds caption input and rejects custom fields in this slice", async () => {
    const { service } = setup();
    await expect(
      service.addItem({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 1, mediaAssetId: mediaReady, captionOverride: "x".repeat(2_201) },
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      service.addItem({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 1, mediaAssetId: mediaReady, customFields: { giant: "x" } },
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });

  it("updates and removes relations without deleting media and compacts positions", async () => {
    const { repository, service } = setup();
    const first = await service.addItem({
      context: context(),
      requestId,
      datasetId,
      body: { expectedVersion: 1, mediaAssetId: mediaReady },
    });
    const second = await service.addItem({
      context: context(),
      requestId,
      datasetId,
      body: { expectedVersion: 2, mediaAssetId: mediaReadyB },
    });
    await expect(
      service.updateItem({
        context: context(),
        requestId,
        datasetId,
        itemId: first.item.datasetItemId,
        body: { expectedVersion: 3, captionOverride: "Updated" },
      }),
    ).resolves.toMatchObject({ dataset: { version: 4 }, item: { captionOverride: "Updated" } });
    await expect(
      service.removeItem({
        context: context(),
        requestId,
        datasetId,
        itemId: first.item.datasetItemId,
        body: { expectedVersion: 4 },
      }),
    ).resolves.toMatchObject({ version: 5, itemCount: 1 });
    expect(repository.items.get(second.item.datasetItemId)?.position).toBe(0);
    expect(repository.media.has(mediaReady)).toBe(true);
    await expect(
      service.removeItem({
        context: context(),
        requestId,
        datasetId,
        itemId: itemC,
        body: { expectedVersion: 5 },
      }),
    ).rejects.toBeInstanceOf(DatasetItemNotFoundError);
  });

  it("performs full deterministic reorder and rejects duplicate, partial, or foreign order", async () => {
    const { service } = setup();
    const first = await service.addItem({
      context: context(),
      requestId,
      datasetId,
      body: { expectedVersion: 1, mediaAssetId: mediaReady },
    });
    const second = await service.addItem({
      context: context(),
      requestId,
      datasetId,
      body: { expectedVersion: 2, mediaAssetId: mediaReadyB },
    });
    await expect(
      service.reorder({
        context: context(),
        requestId,
        datasetId,
        body: {
          expectedVersion: 3,
          itemIds: [second.item.datasetItemId, first.item.datasetItemId],
        },
      }),
    ).resolves.toMatchObject({
      dataset: { version: 4 },
      items: [
        { datasetItemId: second.item.datasetItemId, position: 0 },
        { datasetItemId: first.item.datasetItemId, position: 1 },
      ],
    });
    await expect(
      service.reorder({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 4, itemIds: [itemA, itemA] },
      }),
    ).rejects.toBeInstanceOf(InvalidDatasetOrderError);
    await expect(
      service.reorder({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 4, itemIds: [first.item.datasetItemId] },
      }),
    ).rejects.toBeInstanceOf(InvalidDatasetOrderError);
    await expect(
      service.reorder({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 4, itemIds: [first.item.datasetItemId, itemB] },
      }),
    ).rejects.toBeInstanceOf(InvalidDatasetOrderError);
  });

  it("supports deterministic zero-item and one-item reorder", async () => {
    const empty = setup();
    await expect(
      empty.service.reorder({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 1, itemIds: [] },
      }),
    ).resolves.toMatchObject({ dataset: { version: 2 }, items: [] });
    const one = setup();
    const added = await one.service.addItem({
      context: context(),
      requestId,
      datasetId,
      body: { expectedVersion: 1, mediaAssetId: mediaReady },
    });
    await expect(
      one.service.reorder({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 2, itemIds: [added.item.datasetItemId] },
      }),
    ).resolves.toMatchObject({ dataset: { version: 3 }, items: [{ position: 0 }] });
  });

  it("archives without deleting membership and rejects every archived write", async () => {
    const { repository, service } = setup();
    const added = await service.addItem({
      context: context(),
      requestId,
      datasetId,
      body: { expectedVersion: 1, mediaAssetId: mediaReady },
    });
    await expect(
      service.archive({ context: context(), requestId, datasetId, body: { expectedVersion: 2 } }),
    ).resolves.toMatchObject({ status: "ARCHIVED", version: 3, itemCount: 1 });
    expect(repository.items.has(added.item.datasetItemId)).toBe(true);
    const writes = [
      service.update({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 3, name: "No" },
      }),
      service.addItem({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 3, mediaAssetId: mediaReadyB },
      }),
      service.updateItem({
        context: context(),
        requestId,
        datasetId,
        itemId: added.item.datasetItemId,
        body: { expectedVersion: 3, captionOverride: null },
      }),
      service.removeItem({
        context: context(),
        requestId,
        datasetId,
        itemId: added.item.datasetItemId,
        body: { expectedVersion: 3 },
      }),
      service.reorder({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 3, itemIds: [added.item.datasetItemId] },
      }),
    ];
    for (const operation of writes)
      await expect(operation).rejects.toBeInstanceOf(DatasetArchivedError);
  });

  it("allows exactly one concurrent mutation for the same version", async () => {
    const { service } = setup();
    const outcomes = await Promise.allSettled([
      service.update({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 1, name: "Winner A" },
      }),
      service.update({
        context: context(),
        requestId,
        datasetId,
        body: { expectedVersion: 1, name: "Winner B" },
      }),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("maps persistence failures without leaking database errors", async () => {
    const { repository, service } = setup();
    repository.fail = true;
    await expect(service.get({ context: context(), datasetId })).rejects.toBeInstanceOf(
      DatasetPersistenceFailureError,
    );
  });
});
