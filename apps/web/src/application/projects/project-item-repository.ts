export type ProjectItemMaterializationFailure =
  | "ARCHIVED"
  | "CONFLICT"
  | "INVALID_DATASET"
  | "NOT_CONFIGURABLE"
  | "NOT_FOUND"
  | "RECONCILIATION_CONFLICT";

export interface ProjectItemMaterializationRecord {
  readonly projectId: string;
  readonly datasetId: string;
  readonly projectVersion: number;
  readonly itemCount: number;
  readonly createdCount: number;
  readonly removedCount: number;
  readonly reorderedCount: number;
  readonly changed: boolean;
}

export interface ProjectItemRepositoryPort {
  materialize(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly expectedVersion: number;
  }): Promise<
    | { readonly state: "MATERIALIZED"; readonly result: ProjectItemMaterializationRecord }
    | { readonly state: ProjectItemMaterializationFailure }
  >;
}
