import type { DatasetStatus } from "@otshop/shared";

export interface DatasetRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: DatasetStatus;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  readonly itemCount: number;
}

export interface DatasetItemRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly datasetId: string;
  readonly mediaAssetId: string;
  readonly position: number;
  readonly captionOverride: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly media: {
    readonly status: string;
    readonly mimeType: string;
    readonly durationMs: bigint | null;
    readonly width: number | null;
    readonly height: number | null;
    readonly thumbnailAvailable: boolean;
  };
}

export interface DatasetPage {
  readonly datasets: readonly DatasetRecord[];
  readonly hasMore: boolean;
}

export interface DatasetItemPage {
  readonly items: readonly DatasetItemRecord[];
  readonly hasMore: boolean;
}

export type DatasetMutationState = "ARCHIVED" | "CONFLICT" | "NOT_FOUND";

export interface DatasetRepositoryPort {
  create(input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly createdByUserId: string;
    readonly name: string;
    readonly description: string | null;
  }): Promise<
    | { readonly state: "CREATED"; readonly dataset: DatasetRecord }
    | { readonly state: "NAME_CONFLICT" }
  >;
  findByWorkspaceAndId(workspaceId: string, datasetId: string): Promise<DatasetRecord | null>;
  list(input: {
    readonly workspaceId: string;
    readonly includeArchived: boolean;
    readonly limit: number;
    readonly before?: { readonly createdAt: Date; readonly id: string };
  }): Promise<DatasetPage>;
  listItems(input: {
    readonly workspaceId: string;
    readonly datasetId: string;
    readonly limit: number;
    readonly after?: { readonly position: number; readonly id: string };
  }): Promise<DatasetItemPage>;
  updateMetadata(input: {
    readonly workspaceId: string;
    readonly datasetId: string;
    readonly expectedVersion: number;
    readonly name?: string;
    readonly description?: string | null;
  }): Promise<
    | { readonly state: "UPDATED"; readonly dataset: DatasetRecord }
    | { readonly state: DatasetMutationState | "NAME_CONFLICT" }
  >;
  archive(input: {
    readonly workspaceId: string;
    readonly datasetId: string;
    readonly expectedVersion: number;
  }): Promise<
    | { readonly state: "ARCHIVED"; readonly dataset: DatasetRecord }
    | { readonly state: DatasetMutationState }
  >;
  addItem(input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly datasetId: string;
    readonly mediaAssetId: string;
    readonly captionOverride: string | null;
    readonly expectedVersion: number;
    readonly maximumItems: number;
  }): Promise<
    | { readonly state: "ADDED"; readonly dataset: DatasetRecord; readonly item: DatasetItemRecord }
    | {
        readonly state: DatasetMutationState | "DUPLICATE_MEDIA" | "ITEM_LIMIT" | "MEDIA_NOT_READY";
      }
  >;
  updateItem(input: {
    readonly workspaceId: string;
    readonly datasetId: string;
    readonly itemId: string;
    readonly captionOverride: string | null;
    readonly expectedVersion: number;
  }): Promise<
    | {
        readonly state: "UPDATED";
        readonly dataset: DatasetRecord;
        readonly item: DatasetItemRecord;
      }
    | { readonly state: DatasetMutationState | "ITEM_NOT_FOUND" }
  >;
  removeItem(input: {
    readonly workspaceId: string;
    readonly datasetId: string;
    readonly itemId: string;
    readonly expectedVersion: number;
  }): Promise<
    | { readonly state: "REMOVED"; readonly dataset: DatasetRecord }
    | { readonly state: DatasetMutationState | "ITEM_NOT_FOUND" | "PROJECT_ITEM_CONFLICT" }
  >;
  reorder(input: {
    readonly workspaceId: string;
    readonly datasetId: string;
    readonly itemIds: readonly string[];
    readonly expectedVersion: number;
  }): Promise<
    | {
        readonly state: "REORDERED";
        readonly dataset: DatasetRecord;
        readonly items: readonly DatasetItemRecord[];
      }
    | { readonly state: DatasetMutationState | "INVALID_ORDER" }
  >;
}
