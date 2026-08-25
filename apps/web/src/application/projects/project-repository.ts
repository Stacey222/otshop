import type { ProjectStatus } from "@otshop/shared";

export interface ProjectRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly datasetId: string;
  readonly accountId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectStatus;
  readonly dailyTarget: number | null;
  readonly postingTimezone: string | null;
  readonly postingWindowStart: string | null;
  readonly postingWindowEnd: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  readonly dataset: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly itemCount: number;
  };
}

export interface ProjectPage {
  readonly projects: readonly ProjectRecord[];
  readonly hasMore: boolean;
}

export type ProjectMutationFailure =
  | "ARCHIVED"
  | "CONFLICT"
  | "INVALID_ACCOUNT"
  | "INVALID_DATASET"
  | "NOT_CONFIGURABLE"
  | "NOT_FOUND";

export interface ProjectRepositoryPort {
  create(input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly createdByUserId: string;
    readonly datasetId: string;
    readonly accountId: string | null;
    readonly name: string;
    readonly description: string | null;
    readonly dailyTarget: number | null;
    readonly postingTimezone: string | null;
    readonly postingWindowStart: string | null;
    readonly postingWindowEnd: string | null;
  }): Promise<
    | { readonly state: "CREATED"; readonly project: ProjectRecord }
    | { readonly state: "INVALID_ACCOUNT" | "INVALID_DATASET" | "NAME_CONFLICT" }
  >;
  findByWorkspaceAndId(workspaceId: string, projectId: string): Promise<ProjectRecord | null>;
  list(input: {
    readonly workspaceId: string;
    readonly includeArchived: boolean;
    readonly limit: number;
    readonly before?: { readonly createdAt: Date; readonly id: string };
  }): Promise<ProjectPage>;
  update(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly expectedVersion: number;
    readonly datasetId?: string;
    readonly accountId?: string | null;
    readonly name?: string;
    readonly description?: string | null;
    readonly dailyTarget?: number | null;
    readonly postingTimezone?: string | null;
    readonly postingWindowStart?: string | null;
    readonly postingWindowEnd?: string | null;
  }): Promise<
    | { readonly state: "UPDATED"; readonly project: ProjectRecord }
    | { readonly state: ProjectMutationFailure | "NAME_CONFLICT" }
  >;
  markReady(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly expectedVersion: number;
  }): Promise<
    | { readonly state: "READY"; readonly project: ProjectRecord }
    | { readonly state: ProjectMutationFailure }
  >;
  archive(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly expectedVersion: number;
  }): Promise<
    | { readonly state: "ARCHIVED"; readonly project: ProjectRecord }
    | {
        readonly state: Exclude<
          ProjectMutationFailure,
          "INVALID_ACCOUNT" | "INVALID_DATASET" | "NOT_CONFIGURABLE"
        >;
      }
  >;
}
