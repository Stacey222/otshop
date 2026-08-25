import { z } from "zod";

import { ProductReferenceIdSchema, ShopeeAccountIdSchema } from "./identifiers";

export const CONFIGURATION_DEFAULT_PAGE_SIZE = 25;
export const CONFIGURATION_MAX_PAGE_SIZE = 100;
export const CONFIGURATION_MAX_BODY_BYTES = 16_384;
export const ACCOUNT_DISPLAY_NAME_MAX_LENGTH = 120;
export const ACCOUNT_HANDLE_MAX_LENGTH = 120;
export const AFFILIATE_PRODUCT_DISPLAY_NAME_MAX_LENGTH = 160;
export const AFFILIATE_PRODUCT_IDENTIFIER_MAX_LENGTH = 200;
export const AFFILIATE_PRODUCT_URL_MAX_LENGTH = 2_048;

export const localConfigurationStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const LocalConfigurationStatusSchema = z.enum(localConfigurationStatuses);
export type LocalConfigurationStatus = z.infer<typeof LocalConfigurationStatusSchema>;

const withoutUnsafeControls = <T extends z.ZodString>(schema: T) =>
  schema.refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value));

const nullableText = (maximum: number) =>
  withoutUnsafeControls(z.string().trim().max(maximum))
    .nullable()
    .transform((value) => (value === null || value.length === 0 ? null : value));

export const AccountDisplayNameSchema = withoutUnsafeControls(
  z.string().trim().min(1).max(ACCOUNT_DISPLAY_NAME_MAX_LENGTH),
);
export const AccountHandleSchema = nullableText(ACCOUNT_HANDLE_MAX_LENGTH);
export const AccountCountryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/u);
export const ConfigurationVersionSchema = z.number().int().min(1);

export const ShopeeAccountCreateRequestSchema = z
  .object({
    displayName: AccountDisplayNameSchema,
    accountHandle: AccountHandleSchema.optional(),
    countryCode: AccountCountryCodeSchema,
  })
  .strict();

export const ShopeeAccountUpdateRequestSchema = z
  .object({
    expectedVersion: ConfigurationVersionSchema,
    displayName: AccountDisplayNameSchema.optional(),
    accountHandle: AccountHandleSchema.optional(),
    countryCode: AccountCountryCodeSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.displayName !== undefined ||
      Object.hasOwn(value, "accountHandle") ||
      value.countryCode !== undefined,
    "At least one editable field is required",
  );

export const ConfigurationVersionRequestSchema = z
  .object({ expectedVersion: ConfigurationVersionSchema })
  .strict();

export const AffiliateProductDisplayNameSchema = withoutUnsafeControls(
  z.string().trim().min(1).max(AFFILIATE_PRODUCT_DISPLAY_NAME_MAX_LENGTH),
);
export const AffiliateProductIdentifierSchema = nullableText(
  AFFILIATE_PRODUCT_IDENTIFIER_MAX_LENGTH,
);

const normalizeShopeeUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isShopeeIndonesiaHost = host === "shopee.co.id" || host.endsWith(".shopee.co.id");
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== "" ||
      url.hash !== "" ||
      !isShopeeIndonesiaHost
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
};

export const AffiliateProductUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(AFFILIATE_PRODUCT_URL_MAX_LENGTH)
  .transform((value, context) => {
    const normalized = normalizeShopeeUrl(value);
    if (normalized === null || normalized.length > AFFILIATE_PRODUCT_URL_MAX_LENGTH) {
      context.addIssue({ code: "custom", message: "A conservative HTTPS Shopee URL is required" });
      return z.NEVER;
    }
    return normalized;
  })
  .nullable();

const hasProductReference = (value: {
  readonly productUrl?: string | null | undefined;
  readonly productIdentifier?: string | null | undefined;
}) => value.productUrl != null || value.productIdentifier != null;

export const AffiliateProductCreateRequestSchema = z
  .object({
    accountId: ShopeeAccountIdSchema,
    displayName: AffiliateProductDisplayNameSchema,
    productUrl: AffiliateProductUrlSchema.optional(),
    productIdentifier: AffiliateProductIdentifierSchema.optional(),
  })
  .strict()
  .refine(hasProductReference, "A product URL or operator-supplied identifier is required");

export const AffiliateProductUpdateRequestSchema = z
  .object({
    expectedVersion: ConfigurationVersionSchema,
    accountId: ShopeeAccountIdSchema.optional(),
    displayName: AffiliateProductDisplayNameSchema.optional(),
    productUrl: AffiliateProductUrlSchema.optional(),
    productIdentifier: AffiliateProductIdentifierSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.accountId !== undefined ||
      value.displayName !== undefined ||
      Object.hasOwn(value, "productUrl") ||
      Object.hasOwn(value, "productIdentifier"),
    "At least one editable field is required",
  );

export const AffiliateProductIdSchema = ProductReferenceIdSchema;

export type ShopeeAccountCreateRequest = Readonly<z.infer<typeof ShopeeAccountCreateRequestSchema>>;
export type ShopeeAccountUpdateRequest = Readonly<z.infer<typeof ShopeeAccountUpdateRequestSchema>>;
export type AffiliateProductCreateRequest = Readonly<
  z.infer<typeof AffiliateProductCreateRequestSchema>
>;
export type AffiliateProductUpdateRequest = Readonly<
  z.infer<typeof AffiliateProductUpdateRequestSchema>
>;
