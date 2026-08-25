import { z } from "zod";

import { PermissionSchema, RoleSchema } from "./access-control";
import { ApiErrorEnvelopeSchema } from "./errors";
import {
  DatasetIdSchema,
  DeviceIdSchema,
  MediaAssetIdSchema,
  OrganizationIdSchema,
  ProductReferenceIdSchema,
  ProjectIdSchema,
  PublishAttemptIdSchema,
  PublishJobIdSchema,
  RequestIdSchema,
  ScheduleIdSchema,
  ShopeeAccountIdSchema,
  UserIdSchema,
  WorkerIdSchema,
  WorkspaceIdSchema,
} from "./identifiers";
import { PublishJobStateSchema } from "./jobs";
import {
  MediaInspectionFailureCodeSchema,
  MediaInspectionStatusSchema,
  MediaOrientationSchema,
} from "./media";
import { WorkerProtocolVersionSchema } from "./protocol";
import {
  PublishRequestSchema,
  PublishResultSchema,
  PublishStatusSchema,
  PublisherCapabilitiesSchema,
  PublisherCapabilitySchema,
  PublisherErrorSchema,
} from "./publisher";

export const SHARED_CONTRACT_SCHEMA_VERSION = 2 as const;

const contractSchemas = {
  ApiErrorEnvelope: ApiErrorEnvelopeSchema,
  DatasetId: DatasetIdSchema,
  DeviceId: DeviceIdSchema,
  MediaAssetId: MediaAssetIdSchema,
  MediaInspectionFailureCode: MediaInspectionFailureCodeSchema,
  MediaInspectionStatus: MediaInspectionStatusSchema,
  MediaOrientation: MediaOrientationSchema,
  OrganizationId: OrganizationIdSchema,
  Permission: PermissionSchema,
  ProductReferenceId: ProductReferenceIdSchema,
  ProjectId: ProjectIdSchema,
  PublishAttemptId: PublishAttemptIdSchema,
  PublishJobId: PublishJobIdSchema,
  PublishJobState: PublishJobStateSchema,
  PublishRequest: PublishRequestSchema,
  PublishResult: PublishResultSchema,
  PublishStatus: PublishStatusSchema,
  PublisherCapabilities: PublisherCapabilitiesSchema,
  PublisherCapability: PublisherCapabilitySchema,
  PublisherError: PublisherErrorSchema,
  RequestId: RequestIdSchema,
  Role: RoleSchema,
  ScheduleId: ScheduleIdSchema,
  ShopeeAccountId: ShopeeAccountIdSchema,
  UserId: UserIdSchema,
  WorkerId: WorkerIdSchema,
  WorkerProtocolVersion: WorkerProtocolVersionSchema,
  WorkspaceId: WorkspaceIdSchema,
} as const;

type JsonValue =
  boolean | null | number | string | JsonValue[] | { readonly [key: string]: JsonValue };

function stripStandardMetadata(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(stripStandardMetadata);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "~standard")
        .map(([key, entry]) => [key, stripStandardMetadata(entry)]),
    );
  }

  throw new TypeError("Generated JSON Schema contained a non-JSON value");
}

export function generateSharedContractJsonSchema(): JsonValue {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "OTShop shared cross-boundary contracts",
    contractVersion: SHARED_CONTRACT_SCHEMA_VERSION,
    $defs: Object.fromEntries(
      Object.entries(contractSchemas).map(([name, schema]) => [
        name,
        stripStandardMetadata(z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" })),
      ]),
    ),
  };
}

export function serializeSharedContractJsonSchema(): string {
  return `${JSON.stringify(generateSharedContractJsonSchema(), null, 2)}\n`;
}
