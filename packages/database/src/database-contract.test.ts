import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  JOB_STATE_TRANSITIONS,
  errorCategories,
  permissions,
  publishJobStates,
  publisherKinds,
  roles,
  terminalPublishJobStates,
} from "@otshop/shared";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url)),
  "utf8",
);
const baseMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260824093000_initial_database_foundation/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const invariantMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260824094000_database_invariants/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const assignmentIntegrityMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260824110000_worker_device_assignment_integrity/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const thumbnailClaimMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260825120000_thumbnail_generation_claim/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const datasetLifecycleMigration = readFileSync(
  fileURLToPath(
    new URL("../prisma/migrations/20260825150000_dataset_lifecycle/migration.sql", import.meta.url),
  ),
  "utf8",
);
const developerGuide = readFileSync(
  fileURLToPath(new URL("../../../docs/architecture/database-developer-guide.md", import.meta.url)),
  "utf8",
);

function prismaEnumValues(name: string): string[] {
  const block = new RegExp(`enum ${name} \\{([\\s\\S]*?)\\n\\}`, "u").exec(schema)?.[1];
  if (block === undefined) {
    throw new Error(`Missing Prisma enum ${name}`);
  }

  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("@@"));
}

function sqlTransitionTargets(state: string): string[] {
  const match = new RegExp(`WHEN '${state}' THEN NEW\\."status" IN \\(([^)]*)\\)`, "u").exec(
    invariantMigration,
  );
  return match?.[1]?.match(/'([A-Z_]+)'/gu)?.map((value) => value.slice(1, -1)) ?? [];
}

describe("database contract drift protection", () => {
  it("keeps critical Prisma enums synchronized with @otshop/shared", () => {
    expect(prismaEnumValues("RoleCode")).toEqual(roles);
    expect(prismaEnumValues("PublisherKind")).toEqual(publisherKinds);
    expect(prismaEnumValues("PublishJobStatus")).toEqual(publishJobStates);
    expect(prismaEnumValues("ErrorCategory")).toEqual(errorCategories);
  });

  it("seeds exactly the canonical roles and permissions", () => {
    for (const role of roles) {
      expect(invariantMigration).toContain(`'${role}'`);
    }
    for (const permission of permissions) {
      expect(invariantMigration).toContain(`'${permission}'`);
    }
  });

  it("keeps the database transition trigger synchronized with the shared state machine", () => {
    for (const state of publishJobStates) {
      const expected = JOB_STATE_TRANSITIONS[state];
      expect(sqlTransitionTargets(state)).toEqual(expected);
    }
    expect(invariantMigration).not.toContain("WHEN 'UPLOADING' THEN NEW.\"status\" IN ('QUEUED'");
    for (const state of terminalPublishJobStates) {
      expect(sqlTransitionTargets(state)).toEqual([]);
    }
  });

  it("contains the required database-only tenant and exclusivity constraints", () => {
    expect(baseMigration).toContain(
      'FOREIGN KEY ("workspace_id", "dataset_id") REFERENCES "datasets"("workspace_id", "id")',
    );
    expect(baseMigration).toContain(
      'FOREIGN KEY ("workspace_id", "project_id") REFERENCES "projects"("workspace_id", "id")',
    );
    expect(invariantMigration).toContain('"publish_jobs_idempotency_key_check"');
    expect(invariantMigration).toContain('"device_sessions_one_open_per_device_key"');
    expect(invariantMigration).toContain('"job_leases_one_active_per_job_key"');
    expect(invariantMigration).toContain('"device_leases_one_active_per_device_key"');
    expect(assignmentIntegrityMigration).toMatch(
      /FOREIGN KEY \("workspace_id", "worker_id", "device_id"\)\s+REFERENCES "devices" \("workspace_id", "worker_id", "id"\)/u,
    );
    expect(assignmentIntegrityMigration).toMatch(
      /FOREIGN KEY \("workspace_id", "job_id", "worker_id", "device_id", "job_lease_id"\)\s+REFERENCES "job_leases" \("workspace_id", "job_id", "worker_id", "device_id", "id"\)/u,
    );
    expect(thumbnailClaimMigration).toContain('"thumbnail_generation_started_at" TIMESTAMPTZ(3)');
    expect(thumbnailClaimMigration).toContain('"media_assets_thumbnail_lifecycle_check"');
    expect(thumbnailClaimMigration).toContain("\"status\" = 'READY'");
    expect(datasetLifecycleMigration).toContain('CONSTRAINT "datasets_status_check"');
    expect(datasetLifecycleMigration).toContain("\"status\" IN ('ACTIVE', 'ARCHIVED')");
    expect(datasetLifecycleMigration).toContain('CONSTRAINT "dataset_items_position_max_check"');
    expect(datasetLifecycleMigration).toContain('CHECK ("position" < 1000)');
    expect(datasetLifecycleMigration).toContain('DROP INDEX "dataset_items_dataset_position_key"');
    expect(datasetLifecycleMigration).toContain("DEFERRABLE INITIALLY IMMEDIATE");
  });

  it("keeps the developer-guide model inventories synchronized with Prisma", () => {
    const modelNames = [...schema.matchAll(/^model\s+(\w+)\s+\{/gmu)].map((match) => match[1]);
    const inventory = /<!-- model-inventory:start -->([\s\S]*?)<!-- model-inventory:end -->/u.exec(
      developerGuide,
    )?.[1];
    const ownershipMatrix =
      /<!-- ownership-matrix:start -->([\s\S]*?)<!-- ownership-matrix:end -->/u.exec(
        developerGuide,
      )?.[1];

    expect(inventory, "database developer guide inventory markers are missing").toBeDefined();
    expect(ownershipMatrix, "database ownership matrix markers are missing").toBeDefined();

    for (const documentedBlock of [inventory, ownershipMatrix]) {
      const documentedNames = [...(documentedBlock ?? "").matchAll(/^\| `(\w+)` \|/gmu)].map(
        (match) => match[1],
      );
      expect(documentedNames).toEqual(modelNames);
    }
  });
});
