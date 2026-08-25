import type { LocalConfigurationStatus } from "@otshop/shared";

export interface AffiliateProductRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly accountId: string;
  readonly displayName: string;
  readonly productUrl: string | null;
  readonly productIdentifier: string | null;
  readonly status: LocalConfigurationStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  readonly account: { readonly id: string; readonly displayName: string; readonly status: string };
}

export type AffiliateProductMutationState =
  "ARCHIVED" | "CONFLICT" | "INVALID_ACCOUNT" | "INVALID_REFERENCE" | "NOT_FOUND";

export interface AffiliateProductRepositoryPort {
  create(input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly accountId: string;
    readonly displayName: string;
    readonly productUrl: string | null;
    readonly productIdentifier: string | null;
  }): Promise<
    | { readonly state: "CREATED"; readonly product: AffiliateProductRecord }
    | { readonly state: "CONFLICT" | "INVALID_ACCOUNT" }
  >;
  findByWorkspaceAndId(
    workspaceId: string,
    productId: string,
  ): Promise<AffiliateProductRecord | null>;
  list(input: {
    readonly workspaceId: string;
    readonly includeArchived: boolean;
    readonly limit: number;
    readonly before?: { readonly createdAt: Date; readonly id: string };
  }): Promise<{ readonly products: readonly AffiliateProductRecord[]; readonly hasMore: boolean }>;
  update(input: {
    readonly workspaceId: string;
    readonly productId: string;
    readonly expectedVersion: number;
    readonly accountId?: string;
    readonly displayName?: string;
    readonly productUrl?: string | null;
    readonly productIdentifier?: string | null;
  }): Promise<
    | { readonly state: "UPDATED"; readonly product: AffiliateProductRecord }
    | { readonly state: AffiliateProductMutationState }
  >;
  archive(input: {
    readonly workspaceId: string;
    readonly productId: string;
    readonly expectedVersion: number;
  }): Promise<
    | { readonly state: "ARCHIVED"; readonly product: AffiliateProductRecord }
    | {
        readonly state: Exclude<
          AffiliateProductMutationState,
          "INVALID_ACCOUNT" | "INVALID_REFERENCE"
        >;
      }
  >;
}
