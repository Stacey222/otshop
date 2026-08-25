import type { LocalConfigurationStatus } from "@otshop/shared";

export interface ShopeeAccountRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly displayName: string;
  readonly accountHandle: string | null;
  readonly countryCode: string;
  readonly status: LocalConfigurationStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export type AccountMutationState = "ARCHIVED" | "CONFLICT" | "NOT_FOUND";

export interface ShopeeAccountRepositoryPort {
  create(input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly displayName: string;
    readonly accountHandle: string | null;
    readonly countryCode: string;
  }): Promise<
    | { readonly state: "CREATED"; readonly account: ShopeeAccountRecord }
    | { readonly state: "CONFLICT" }
  >;
  findByWorkspaceAndId(workspaceId: string, accountId: string): Promise<ShopeeAccountRecord | null>;
  list(input: {
    readonly workspaceId: string;
    readonly includeArchived: boolean;
    readonly limit: number;
    readonly before?: { readonly createdAt: Date; readonly id: string };
  }): Promise<{ readonly accounts: readonly ShopeeAccountRecord[]; readonly hasMore: boolean }>;
  update(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly expectedVersion: number;
    readonly displayName?: string;
    readonly accountHandle?: string | null;
    readonly countryCode?: string;
  }): Promise<
    | { readonly state: "UPDATED"; readonly account: ShopeeAccountRecord }
    | { readonly state: AccountMutationState }
  >;
  archive(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly expectedVersion: number;
  }): Promise<
    | { readonly state: "ARCHIVED"; readonly account: ShopeeAccountRecord }
    | { readonly state: AccountMutationState }
  >;
}
