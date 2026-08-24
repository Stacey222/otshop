-- UUIDv7 remains application-generated. PostgreSQL stores and validates it.
CREATE FUNCTION "is_uuid_v7"(value UUID)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
STRICT
AS $$
  SELECT value::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
$$;

ALTER TABLE "users" ADD CONSTRAINT "users_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "roles" ADD CONSTRAINT "roles_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "shopee_accounts" ADD CONSTRAINT "shopee_accounts_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "workers" ADD CONSTRAINT "workers_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "worker_credentials" ADD CONSTRAINT "worker_credentials_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "worker_enrollment_tokens" ADD CONSTRAINT "worker_enrollment_tokens_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "devices" ADD CONSTRAINT "devices_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "dataset_items" ADD CONSTRAINT "dataset_items_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "projects" ADD CONSTRAINT "projects_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "product_references" ADD CONSTRAINT "product_references_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "schedule_runs" ADD CONSTRAINT "schedule_runs_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "publish_results" ADD CONSTRAINT "publish_results_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "job_leases" ADD CONSTRAINT "job_leases_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "device_leases" ADD CONSTRAINT "device_leases_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_id_uuid_v7_check" CHECK ("is_uuid_v7"("id"));
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_execution_slot_uuid_v7_check" CHECK ("is_uuid_v7"("execution_slot_id"));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_request_id_uuid_v7_check" CHECK ("is_uuid_v7"("request_id"));

-- Checks Prisma cannot express in the schema language.
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_failed_attempts_check" CHECK ("failed_attempts" >= 0);
ALTER TABLE "shopee_accounts" ADD CONSTRAINT "shopee_accounts_country_code_check" CHECK ("country_code" ~ '^[A-Z]{2}$');
ALTER TABLE "shopee_accounts" ADD CONSTRAINT "shopee_accounts_version_check" CHECK ("version" >= 1);
ALTER TABLE "workers" ADD CONSTRAINT "workers_version_counter_check" CHECK ("version_counter" >= 1);
ALTER TABLE "devices" ADD CONSTRAINT "devices_version_check" CHECK ("version" >= 1);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_size_check" CHECK ("size_bytes" > 0);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_sha256_check" CHECK (octet_length("sha256") = 32);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_dimensions_check" CHECK (("duration_ms" IS NULL OR "duration_ms" >= 0) AND ("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0) AND ("bitrate_bps" IS NULL OR "bitrate_bps" >= 0));
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_version_check" CHECK ("version" >= 1);
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_version_check" CHECK ("version" >= 1);
ALTER TABLE "dataset_items" ADD CONSTRAINT "dataset_items_position_check" CHECK ("position" >= 0);
ALTER TABLE "projects" ADD CONSTRAINT "projects_limits_check" CHECK ("minimum_interval_seconds" >= 0 AND ("daily_limit" IS NULL OR "daily_limit" > 0) AND "max_attempts" >= 1 AND "version" >= 1);
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_position_check" CHECK ("position" >= 0);
ALTER TABLE "product_references" ADD CONSTRAINT "product_references_version_check" CHECK ("version" >= 1);
ALTER TABLE "project_item_products" ADD CONSTRAINT "project_item_products_position_check" CHECK ("position" >= 0);
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_version_check" CHECK ("version" >= 1);
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_required_fields_check" CHECK (
  ("kind" = 'IMMEDIATE_TEMPLATE' AND "start_local" IS NULL AND "rrule" IS NULL)
  OR ("kind" = 'ONCE' AND "start_local" IS NOT NULL AND "rrule" IS NULL)
  OR ("kind" = 'RECURRING' AND "start_local" IS NOT NULL AND "rrule" IS NOT NULL)
);
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_idempotency_key_check" CHECK ("idempotency_key" ~ '^[a-f0-9]{64}$');
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_attempt_bounds_check" CHECK ("attempt_count" >= 0 AND "max_attempts" >= 1 AND "attempt_count" <= "max_attempts");
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_terminal_completion_check" CHECK ("status" NOT IN ('SUCCESS', 'CANCELLED', 'FAILED') OR "completed_at" IS NOT NULL);
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_version_check" CHECK ("version" >= 1);
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_number_check" CHECK ("attempt_number" > 0);
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_duration_check" CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0);
ALTER TABLE "job_leases" ADD CONSTRAINT "job_leases_time_check" CHECK ("ack_deadline_at" >= "offered_at" AND "expires_at" >= "offered_at" AND "version" >= 1);
ALTER TABLE "device_leases" ADD CONSTRAINT "device_leases_time_check" CHECK ("ack_deadline_at" >= "offered_at" AND "expires_at" >= "offered_at" AND "version" >= 1);
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_sequence_check" CHECK ("sequence" > 0);
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_attempt_count_check" CHECK ("attempt_count" >= 0);
ALTER TABLE "workspace_dispatch_state" ADD CONSTRAINT "workspace_dispatch_state_counts_check" CHECK ("dispatch_count" >= 0 AND "version" >= 1);
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_schema_version_check" CHECK ("schema_version" >= 1);
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_schema_version_check" CHECK ("schema_version" >= 1);

-- Nullable business identifiers are unique only when present.
CREATE UNIQUE INDEX "shopee_accounts_workspace_operator_reference_key"
  ON "shopee_accounts" ("workspace_id", "operator_reference")
  WHERE "operator_reference" IS NOT NULL;
CREATE UNIQUE INDEX "product_references_workspace_account_operator_reference_key"
  ON "product_references" ("workspace_id", "account_id", "operator_reference")
  WHERE "operator_reference" IS NOT NULL;

-- Persisted session and lease exclusivity; Prisma cannot declare partial indexes.
CREATE UNIQUE INDEX "device_sessions_one_open_per_device_key"
  ON "device_sessions" ("device_id")
  WHERE "ended_at" IS NULL;
CREATE UNIQUE INDEX "job_leases_one_active_per_job_key"
  ON "job_leases" ("job_id")
  WHERE "status" IN ('OFFERED', 'ACTIVE');
CREATE UNIQUE INDEX "device_leases_one_active_per_device_key"
  ON "device_leases" ("device_id")
  WHERE "status" IN ('OFFERED', 'ACTIVE');

-- Fixed role scope is enforced at membership assignment boundaries.
CREATE FUNCTION "enforce_workspace_role_scope"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "id" = NEW."role_id" AND "scope" = 'WORKSPACE') THEN
    RAISE EXCEPTION 'workspace membership requires a workspace-scoped role' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "workspace_members_role_scope_trigger"
BEFORE INSERT OR UPDATE OF "role_id" ON "workspace_members"
FOR EACH ROW EXECUTE FUNCTION "enforce_workspace_role_scope"();

CREATE FUNCTION "enforce_system_role_scope"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "id" = NEW."role_id" AND "scope" = 'SYSTEM') THEN
    RAISE EXCEPTION 'system role assignment requires a system-scoped role' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "user_system_roles_scope_trigger"
BEFORE INSERT OR UPDATE OF "role_id" ON "user_system_roles"
FOR EACH ROW EXECUTE FUNCTION "enforce_system_role_scope"();

-- The database rejects every direct transition not authorized by Phase 1.
CREATE FUNCTION "enforce_publish_job_transition"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  allowed BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'new publish job must start in DRAFT' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;

  allowed := CASE OLD."status"
    WHEN 'DRAFT' THEN NEW."status" IN ('QUEUED', 'CANCELLED')
    WHEN 'QUEUED' THEN NEW."status" IN ('PREPARING', 'WAITING_FOR_DEVICE', 'PAUSED', 'CANCELLED')
    WHEN 'PREPARING' THEN NEW."status" IN ('PROCESSING_MEDIA', 'WAITING_FOR_DEVICE', 'WAITING_FOR_AUTH', 'UPLOADING', 'RETRYING', 'PAUSED', 'CANCELLED', 'FAILED')
    WHEN 'WAITING_FOR_DEVICE' THEN NEW."status" IN ('QUEUED', 'PAUSED', 'CANCELLED', 'FAILED')
    WHEN 'WAITING_FOR_AUTH' THEN NEW."status" IN ('QUEUED', 'PAUSED', 'CANCELLED', 'FAILED')
    WHEN 'PROCESSING_MEDIA' THEN NEW."status" IN ('PREPARING', 'RETRYING', 'PAUSED', 'CANCELLED', 'FAILED')
    WHEN 'UPLOADING' THEN NEW."status" IN ('VERIFYING', 'RETRYING', 'FAILED', 'UNKNOWN_PUBLISH_STATE')
    WHEN 'VERIFYING' THEN NEW."status" IN ('SUCCESS', 'RETRYING', 'FAILED', 'UNKNOWN_PUBLISH_STATE', 'NEEDS_REVIEW')
    WHEN 'RETRYING' THEN NEW."status" IN ('QUEUED', 'PAUSED', 'CANCELLED', 'FAILED')
    WHEN 'PAUSED' THEN NEW."status" IN ('QUEUED', 'CANCELLED')
    WHEN 'UNKNOWN_PUBLISH_STATE' THEN NEW."status" IN ('VERIFYING', 'SUCCESS', 'FAILED', 'NEEDS_REVIEW')
    WHEN 'NEEDS_REVIEW' THEN NEW."status" IN ('QUEUED', 'SUCCESS', 'FAILED')
    ELSE FALSE
  END;

  IF NOT allowed THEN
    RAISE EXCEPTION 'invalid publish job state transition: % -> %', OLD."status", NEW."status" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "publish_jobs_transition_trigger"
BEFORE INSERT OR UPDATE OF "status" ON "publish_jobs"
FOR EACH ROW EXECUTE FUNCTION "enforce_publish_job_transition"();

-- Events and audits are append-only history.
CREATE FUNCTION "reject_immutable_history_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "job_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "job_events"
FOR EACH ROW EXECUTE FUNCTION "reject_immutable_history_mutation"();
CREATE TRIGGER "audit_logs_append_only_trigger"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "reject_immutable_history_mutation"();

-- Canonical fixed roles. IDs are deterministic UUIDv7 values for migration seeding.
INSERT INTO "roles" ("id", "code", "scope", "description", "created_at", "updated_at") VALUES
  ('01941f29-7c00-7000-8000-000000000001', 'SUPER_ADMIN', 'SYSTEM', 'Canonical fixed role SUPER_ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000002', 'ADMIN', 'WORKSPACE', 'Canonical fixed role ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000003', 'SUPERVISOR', 'WORKSPACE', 'Canonical fixed role SUPERVISOR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000004', 'OPERATOR', 'WORKSPACE', 'Canonical fixed role OPERATOR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000005', 'VIEWER', 'WORKSPACE', 'Canonical fixed role VIEWER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "permissions" ("id", "code", "description", "created_at", "updated_at") VALUES
  ('01941f29-7c00-7000-8000-000000000101', 'system.manage', 'Canonical permission system.manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000102', 'workspace.read', 'Canonical permission workspace.read', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000103', 'workspace.manage', 'Canonical permission workspace.manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000104', 'members.read', 'Canonical permission members.read', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000105', 'members.manage', 'Canonical permission members.manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000106', 'accounts.read', 'Canonical permission accounts.read', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000107', 'accounts.manage', 'Canonical permission accounts.manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000108', 'workers.read', 'Canonical permission workers.read', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000109', 'workers.manage', 'Canonical permission workers.manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-00000000010a', 'devices.read', 'Canonical permission devices.read', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-00000000010b', 'devices.manage', 'Canonical permission devices.manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-00000000010c', 'datasets.read', 'Canonical permission datasets.read', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-00000000010d', 'datasets.write', 'Canonical permission datasets.write', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-00000000010e', 'media.upload', 'Canonical permission media.upload', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-00000000010f', 'media.delete', 'Canonical permission media.delete', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000110', 'projects.read', 'Canonical permission projects.read', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000111', 'projects.write', 'Canonical permission projects.write', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000112', 'projects.run', 'Canonical permission projects.run', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000113', 'projects.pause_resume', 'Canonical permission projects.pause_resume', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000114', 'jobs.read', 'Canonical permission jobs.read', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000115', 'jobs.create', 'Canonical permission jobs.create', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000116', 'jobs.cancel', 'Canonical permission jobs.cancel', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000117', 'jobs.retry', 'Canonical permission jobs.retry', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000118', 'jobs.resolve_review', 'Canonical permission jobs.resolve_review', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-000000000119', 'schedules.read', 'Canonical permission schedules.read', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-00000000011a', 'schedules.manage', 'Canonical permission schedules.manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-00000000011b', 'reports.read', 'Canonical permission reports.read', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-00000000011c', 'reports.export', 'Canonical permission reports.export', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-00000000011d', 'audit.read', 'Canonical permission audit.read', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('01941f29-7c00-7000-8000-00000000011e', 'settings.manage', 'Canonical permission settings.manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'SUPER_ADMIN'
   OR (r."code" = 'ADMIN' AND p."code" <> 'system.manage')
   OR (r."code" = 'SUPERVISOR' AND p."code" IN (
     'workspace.read', 'members.read', 'accounts.read', 'workers.read', 'devices.read',
     'datasets.read', 'datasets.write', 'media.upload', 'media.delete', 'projects.read',
     'projects.write', 'projects.run', 'projects.pause_resume', 'jobs.read', 'jobs.create',
     'jobs.cancel', 'jobs.retry', 'jobs.resolve_review', 'schedules.read', 'schedules.manage',
     'reports.read', 'reports.export', 'audit.read'
   ))
   OR (r."code" = 'OPERATOR' AND p."code" IN (
     'workspace.read', 'accounts.read', 'workers.read', 'devices.read', 'datasets.read',
     'datasets.write', 'media.upload', 'projects.read', 'projects.write', 'projects.run',
     'projects.pause_resume', 'jobs.read', 'jobs.create', 'jobs.cancel', 'jobs.retry',
     'schedules.read', 'reports.read'
   ))
   OR (r."code" = 'VIEWER' AND p."code" IN (
     'workspace.read', 'accounts.read', 'workers.read', 'devices.read', 'datasets.read',
     'projects.read', 'jobs.read', 'schedules.read', 'reports.read'
   ));

CREATE FUNCTION "protect_fixed_access_control_records"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% records are migration-owned', TG_TABLE_NAME USING ERRCODE = '55000';
  END IF;
  IF NEW."id" <> OLD."id" OR NEW."code" <> OLD."code"
     OR (TG_TABLE_NAME = 'roles' AND to_jsonb(NEW)->>'scope' <> to_jsonb(OLD)->>'scope') THEN
    RAISE EXCEPTION '% identity is migration-owned', TG_TABLE_NAME USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "roles_fixed_records_trigger"
BEFORE UPDATE OR DELETE ON "roles"
FOR EACH ROW EXECUTE FUNCTION "protect_fixed_access_control_records"();
CREATE TRIGGER "permissions_fixed_records_trigger"
BEFORE UPDATE OR DELETE ON "permissions"
FOR EACH ROW EXECUTE FUNCTION "protect_fixed_access_control_records"();
