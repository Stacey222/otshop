export type ProjectItemProductFailure =
  | "CONFLICT"
  | "ITEM_ARCHIVED"
  | "ITEM_LIMIT"
  | "ITEM_NOT_FOUND"
  | "PRODUCT_ACCOUNT_MISMATCH"
  | "PRODUCT_ARCHIVED"
  | "PRODUCT_NOT_FOUND"
  | "PROJECT_NOT_DRAFT"
  | "PROJECT_NOT_FOUND";

export interface ProjectItemProductRecord {
  readonly projectId: string;
  readonly projectItemId: string;
  readonly projectVersion: number;
  readonly projectStatus: string;
  readonly projectItemStatus: string;
  readonly assignment: null | {
    readonly productId: string;
    readonly accountId: string;
    readonly displayName: string;
    readonly status: string;
  };
}

type MutationResult =
  | {
      readonly state: "ASSIGNED" | "REMOVED";
      readonly changed: boolean;
      readonly result: ProjectItemProductRecord;
    }
  | { readonly state: ProjectItemProductFailure };

export interface ProjectItemProductRepositoryPort {
  find(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly projectItemId: string;
  }): Promise<
    | { readonly state: "FOUND"; readonly result: ProjectItemProductRecord }
    | { readonly state: "ITEM_NOT_FOUND" | "PROJECT_NOT_FOUND" }
  >;
  assign(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly projectItemId: string;
    readonly productId: string;
    readonly expectedVersion: number;
  }): Promise<MutationResult>;
  remove(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly projectItemId: string;
    readonly expectedVersion: number;
  }): Promise<MutationResult>;
  assignAll(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly productId: string;
    readonly expectedVersion: number;
  }): Promise<
    | {
        readonly state: "BULK_ASSIGNED";
        readonly changed: boolean;
        readonly projectId: string;
        readonly projectVersion: number;
        readonly itemCount: number;
        readonly changedCount: number;
        readonly productId: string;
      }
    | { readonly state: ProjectItemProductFailure }
  >;
}
