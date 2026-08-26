import { z } from "zod";

import { DatasetIdSchema, ProductReferenceIdSchema, ShopeeAccountIdSchema } from "./identifiers";

export const PROJECT_DEFAULT_PAGE_SIZE = 25;
export const PROJECT_MAX_PAGE_SIZE = 100;
export const PROJECT_MAX_METADATA_BYTES = 16_384;
export const PROJECT_NAME_MAX_LENGTH = 120;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 2_000;
export const PROJECT_DAILY_TARGET_MAX = 50;

export const projectStatuses = ["DRAFT", "READY", "ARCHIVED"] as const;
export const ProjectStatusSchema = z.enum(projectStatuses);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const projectItemStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const ProjectItemStatusSchema = z.enum(projectItemStatuses);
export type ProjectItemStatus = z.infer<typeof ProjectItemStatusSchema>;

const withoutUnsafeControls = <T extends z.ZodString>(schema: T) =>
  schema.refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value));

export const ProjectNameSchema = withoutUnsafeControls(
  z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH),
);

export const ProjectDescriptionSchema = withoutUnsafeControls(
  z.string().trim().max(PROJECT_DESCRIPTION_MAX_LENGTH),
)
  .nullable()
  .transform((value) => (value === null || value.length === 0 ? null : value));

export const ProjectDailyTargetSchema = z.number().int().min(1).max(PROJECT_DAILY_TARGET_MAX);
export const ProjectVersionSchema = z.number().int().min(1);

const isCanonicalTimeZone = (value: string): boolean => {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone === value
    );
  } catch {
    return false;
  }
};

export const ProjectTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(isCanonicalTimeZone, "A canonical IANA timezone is required");

export const ProjectLocalTimeSchema = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/u);

export const ProjectPostingWindowSchema = z
  .object({
    startLocalTime: ProjectLocalTimeSchema,
    endLocalTime: ProjectLocalTimeSchema,
    timezone: ProjectTimezoneSchema,
  })
  .strict()
  .refine((value) => value.startLocalTime < value.endLocalTime, {
    message: "The posting window must end after it starts",
  });

export const ProjectCreateRequestSchema = z
  .object({
    name: ProjectNameSchema,
    description: ProjectDescriptionSchema.optional(),
    datasetId: DatasetIdSchema,
    accountId: ShopeeAccountIdSchema.nullable().optional(),
    dailyTarget: ProjectDailyTargetSchema.nullable().optional(),
    postingWindow: ProjectPostingWindowSchema.nullable().optional(),
  })
  .strict();

export const ProjectUpdateRequestSchema = z
  .object({
    expectedVersion: ProjectVersionSchema,
    name: ProjectNameSchema.optional(),
    description: ProjectDescriptionSchema.optional(),
    datasetId: DatasetIdSchema.optional(),
    accountId: ShopeeAccountIdSchema.nullable().optional(),
    dailyTarget: ProjectDailyTargetSchema.nullable().optional(),
    postingWindow: ProjectPostingWindowSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      Object.hasOwn(value, "description") ||
      value.datasetId !== undefined ||
      Object.hasOwn(value, "accountId") ||
      Object.hasOwn(value, "dailyTarget") ||
      Object.hasOwn(value, "postingWindow"),
    "At least one editable field is required",
  );

export const ProjectVersionRequestSchema = z
  .object({ expectedVersion: ProjectVersionSchema })
  .strict();

export const ProjectItemMaterializeRequestSchema = ProjectVersionRequestSchema;

export const ProjectItemProductAssignRequestSchema = z
  .object({
    productId: ProductReferenceIdSchema,
    expectedVersion: ProjectVersionSchema,
  })
  .strict();

export const ProjectItemProductRemoveRequestSchema = ProjectVersionRequestSchema;
export const ProjectItemProductBulkAssignRequestSchema = ProjectItemProductAssignRequestSchema;

export type ProjectCreateRequest = Readonly<z.infer<typeof ProjectCreateRequestSchema>>;
export type ProjectUpdateRequest = Readonly<z.infer<typeof ProjectUpdateRequestSchema>>;
export type ProjectVersionRequest = Readonly<z.infer<typeof ProjectVersionRequestSchema>>;
export type ProjectItemProductAssignRequest = Readonly<
  z.infer<typeof ProjectItemProductAssignRequestSchema>
>;
