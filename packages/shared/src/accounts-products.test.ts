import { describe, expect, it } from "vitest";

import {
  AFFILIATE_PRODUCT_URL_MAX_LENGTH,
  AffiliateProductCreateRequestSchema,
  AffiliateProductUpdateRequestSchema,
  ShopeeAccountCreateRequestSchema,
  ShopeeAccountUpdateRequestSchema,
} from "./accounts-products";

const accountId = "01941f29-7c00-7000-8000-000000000001";

describe("account and affiliate product contracts", () => {
  it("normalizes bounded local account input and rejects credentials or ownership fields", () => {
    expect(
      ShopeeAccountCreateRequestSchema.parse({
        displayName: "  Main shop  ",
        accountHandle: "  @main  ",
        countryCode: "id",
      }),
    ).toEqual({ displayName: "Main shop", accountHandle: "@main", countryCode: "ID" });
    expect(() =>
      ShopeeAccountCreateRequestSchema.parse({
        displayName: "Main",
        countryCode: "ID",
        password: "secret",
      }),
    ).toThrow();
    expect(() =>
      ShopeeAccountCreateRequestSchema.parse({
        displayName: "Main",
        countryCode: "ID",
        workspaceId: accountId,
      }),
    ).toThrow();
  });

  it("rejects empty, overlong, malformed, and no-op account mutations", () => {
    expect(() =>
      ShopeeAccountCreateRequestSchema.parse({ displayName: " ", countryCode: "ID" }),
    ).toThrow();
    expect(() =>
      ShopeeAccountCreateRequestSchema.parse({ displayName: "x".repeat(121), countryCode: "ID" }),
    ).toThrow();
    expect(() =>
      ShopeeAccountCreateRequestSchema.parse({ displayName: "Main", countryCode: "Indonesia" }),
    ).toThrow();
    expect(() => ShopeeAccountUpdateRequestSchema.parse({ expectedVersion: 1 })).toThrow();
  });

  it("accepts an unverified local Shopee URL without performing resolution", () => {
    expect(
      AffiliateProductCreateRequestSchema.parse({
        accountId,
        displayName: "Product A",
        productUrl: "https://shopee.co.id/product/123?affiliate=operator",
      }),
    ).toMatchObject({ accountId, displayName: "Product A" });
  });

  it("rejects unsafe, malformed, credential-bearing, and overlong URLs", () => {
    for (const productUrl of [
      "http://shopee.co.id/product/1",
      "https://example.com/product/1",
      "https://shopee.evil.com/product/1",
      "https://user:secret@shopee.co.id/product/1",
      "https://shopee.co.id/product/1#fragment",
      `https://shopee.co.id/${"產".repeat(300)}`,
      "x".repeat(AFFILIATE_PRODUCT_URL_MAX_LENGTH + 1),
    ]) {
      expect(() =>
        AffiliateProductCreateRequestSchema.parse({
          accountId,
          displayName: "Product",
          productUrl,
        }),
      ).toThrow();
    }
  });

  it("requires a local reference and rejects unknown or no-op product fields", () => {
    expect(() =>
      AffiliateProductCreateRequestSchema.parse({ accountId, displayName: "Product" }),
    ).toThrow();
    expect(() => AffiliateProductUpdateRequestSchema.parse({ expectedVersion: 1 })).toThrow();
    expect(() =>
      AffiliateProductUpdateRequestSchema.parse({ expectedVersion: 1, privateProductId: "1" }),
    ).toThrow();
  });
});
