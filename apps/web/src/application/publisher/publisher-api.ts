import { PublishRequestSchema, PublisherKindSchema } from "@otshop/shared";
import { z } from "zod";

import { MockScenarioSchema } from "./mock-publisher";

export const PublisherPreflightInputSchema = z
  .object({
    publisherKind: PublisherKindSchema,
    request: PublishRequestSchema,
  })
  .strict();

export const MockPublisherExecutionInputSchema = z
  .object({
    request: PublishRequestSchema,
    scenario: MockScenarioSchema,
  })
  .strict();
