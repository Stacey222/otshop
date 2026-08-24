import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { generateSharedContractJsonSchema, serializeSharedContractJsonSchema } from "./json-schema";

const artifactPath = fileURLToPath(new URL("../schema/contracts.schema.json", import.meta.url));

describe("generated shared contract JSON Schema", () => {
  it("contains only JSON-friendly data", () => {
    const schema = generateSharedContractJsonSchema();
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });

  it("matches the committed artifact", async () => {
    await expect(serializeSharedContractJsonSchema()).toMatchFileSnapshot(artifactPath);
  });
});
