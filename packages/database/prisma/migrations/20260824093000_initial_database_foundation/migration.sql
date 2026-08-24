-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "role_code" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "role_scope" AS ENUM ('SYSTEM', 'WORKSPACE');

-- CreateEnum
CREATE TYPE "connection_type" AS ENUM ('USB', 'WIRELESS_ADB');

-- CreateEnum
CREATE TYPE "media_source" AS ENUM ('LOCAL_FILE', 'MANUAL_UPLOAD');

-- CreateEnum
CREATE TYPE "product_source" AS ENUM ('MANUAL');

-- CreateEnum
CREATE TYPE "schedule_kind" AS ENUM ('IMMEDIATE_TEMPLATE', 'ONCE', 'RECURRING');

-- CreateEnum
CREATE TYPE "lease_status" AS ENUM ('OFFERED', 'ACTIVE', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "publisher_kind" AS ENUM ('MOCK', 'SHOPEE_OFFICIAL_API', 'SHOPEE_ANDROID');

-- CreateEnum
CREATE TYPE "publish_job_status" AS ENUM ('DRAFT', 'QUEUED', 'PREPARING', 'WAITING_FOR_DEVICE', 'WAITING_FOR_AUTH', 'PROCESSING_MEDIA', 'UPLOADING', 'VERIFYING', 'SUCCESS', 'RETRYING', 'PAUSED', 'CANCELLED', 'FAILED', 'UNKNOWN_PUBLISH_STATE', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "job_priority" AS ENUM ('URGENT', 'HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "error_category" AS ENUM ('RETRYABLE', 'NON_RETRYABLE', 'MANUAL_REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "user_status" NOT NULL,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_credentials" (
    "user_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_changed_at" TIMESTAMPTZ(3) NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "ip_prefix" TEXT,
    "user_agent_family" TEXT,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" CITEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" CITEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" "role_code" NOT NULL,
    "scope" "role_scope" NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_system_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_system_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "invited_by_user_id" UUID,
    "joined_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopee_accounts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "shop_name" TEXT,
    "operator_reference" TEXT,
    "country_code" CHAR(2) NOT NULL,
    "status" TEXT NOT NULL,
    "bound_device_id" UUID,
    "last_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "shopee_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "instance_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "last_heartbeat_at" TIMESTAMPTZ(3),
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version_counter" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_credentials" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "secret_hash" BYTEA NOT NULL,
    "label" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "worker_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_enrollment_tokens" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "worker_enrollment_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "adb_serial" TEXT NOT NULL,
    "connection_type" "connection_type" NOT NULL,
    "ip_address" INET,
    "status" TEXT NOT NULL,
    "android_version" TEXT,
    "model" TEXT,
    "shopee_installed" BOOLEAN,
    "shopee_version" TEXT,
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_sessions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "expected_account_id" UUID,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "last_heartbeat_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" TEXT,
    "sanitized_facts" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source" "media_source" NOT NULL,
    "original_filename" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" BYTEA NOT NULL,
    "status" TEXT NOT NULL,
    "duration_ms" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "fps" DECIMAL(10,3),
    "bitrate_bps" BIGINT,
    "codec" TEXT,
    "audio_codec" TEXT,
    "orientation" TEXT,
    "thumbnail_key" TEXT,
    "content_source" TEXT,
    "content_owner" TEXT,
    "license_reference" TEXT,
    "notes" TEXT,
    "validation_error_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "datasets" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_items" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "caption_override" TEXT,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dataset_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "schedule_kind" NOT NULL,
    "timezone" TEXT NOT NULL,
    "start_local" TIMESTAMP(0),
    "rrule" TEXT,
    "next_run_at" TIMESTAMPTZ(3),
    "end_at" TIMESTAMPTZ(3),
    "dst_gap_policy" TEXT NOT NULL,
    "dst_overlap_policy" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "preferred_device_id" UUID,
    "schedule_id" UUID,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "publisher_kind" "publisher_kind" NOT NULL,
    "caption_mode" TEXT NOT NULL,
    "caption_template" TEXT,
    "hashtag_template" TEXT,
    "minimum_interval_seconds" INTEGER NOT NULL,
    "daily_limit" INTEGER,
    "max_attempts" INTEGER NOT NULL,
    "retry_policy" JSONB NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_items" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "dataset_item_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "caption" TEXT,
    "status" TEXT NOT NULL,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_references" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "operator_reference" TEXT,
    "product_url" TEXT,
    "sku" TEXT,
    "source" "product_source" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "product_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_item_products" (
    "workspace_id" UUID NOT NULL,
    "project_item_id" UUID NOT NULL,
    "product_reference_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_item_products_pkey" PRIMARY KEY ("project_item_id","product_reference_id")
);

-- CreateTable
CREATE TABLE "schedule_runs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
    "local_occurrence" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedule_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publish_jobs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "project_item_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "device_id" UUID,
    "schedule_run_id" UUID,
    "retry_of_job_id" UUID,
    "publisher_kind" "publisher_kind" NOT NULL,
    "status" "publish_job_status" NOT NULL,
    "priority" "job_priority" NOT NULL,
    "execution_slot_id" UUID NOT NULL,
    "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
    "available_at" TIMESTAMPTZ(3) NOT NULL,
    "idempotency_key" CHAR(64) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL,
    "cancel_requested_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "last_error_code" TEXT,
    "last_error_category" "error_category",
    "recovery_note" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "publish_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publish_attempts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "error_code" TEXT,
    "error_category" "error_category",
    "sanitized_message" TEXT,
    "duration_ms" BIGINT,
    "diagnostic_bundle_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "publish_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publish_results" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "outcome" TEXT NOT NULL,
    "external_reference" TEXT,
    "status_value" TEXT,
    "published_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "sanitized_metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "publish_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_leases" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "lease_token_hash" BYTEA NOT NULL,
    "status" "lease_status" NOT NULL,
    "offered_at" TIMESTAMPTZ(3) NOT NULL,
    "ack_deadline_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(3),
    "last_renewed_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_leases" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "job_lease_id" UUID NOT NULL,
    "status" "lease_status" NOT NULL,
    "offered_at" TIMESTAMPTZ(3) NOT NULL,
    "ack_deadline_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(3),
    "last_renewed_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "attempt_id" UUID,
    "sequence" BIGINT NOT NULL,
    "event_type" TEXT NOT NULL,
    "from_status" "publish_job_status",
    "to_status" "publish_job_status",
    "actor_type" TEXT NOT NULL,
    "actor_id" UUID,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "organization_id" UUID,
    "actor_type" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "before_data" JSONB,
    "after_data" JSONB,
    "ip_prefix" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "topic" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_at" TIMESTAMPTZ(3) NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_dispatch_state" (
    "workspace_id" UUID NOT NULL,
    "last_dispatched_at" TIMESTAMPTZ(3),
    "dispatch_count" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspace_dispatch_state_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "workspace_settings" (
    "workspace_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspace_settings_pkey" PRIMARY KEY ("workspace_id","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_expiry_idx" ON "user_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "workspaces_organization_status_idx" ON "workspaces"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_organization_slug_key" ON "workspaces"("organization_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_organization_id_id_key" ON "workspaces"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "user_system_roles_role_idx" ON "user_system_roles"("role_id");

-- CreateIndex
CREATE INDEX "user_system_roles_grantor_idx" ON "user_system_roles"("granted_by_user_id");

-- CreateIndex
CREATE INDEX "workspace_members_user_status_idx" ON "workspace_members"("user_id", "status");

-- CreateIndex
CREATE INDEX "workspace_members_role_idx" ON "workspace_members"("role_id");

-- CreateIndex
CREATE INDEX "workspace_members_inviter_idx" ON "workspace_members"("invited_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_user_key" ON "workspace_members"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_id_key" ON "workspace_members"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "shopee_accounts_bound_device_idx" ON "shopee_accounts"("workspace_id", "bound_device_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopee_accounts_workspace_display_name_key" ON "shopee_accounts"("workspace_id", "display_name");

-- CreateIndex
CREATE UNIQUE INDEX "shopee_accounts_workspace_id_id_key" ON "shopee_accounts"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "workers_workspace_status_heartbeat_idx" ON "workers"("workspace_id", "status", "last_heartbeat_at");

-- CreateIndex
CREATE UNIQUE INDEX "workers_workspace_name_key" ON "workers"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "workers_workspace_instance_key_key" ON "workers"("workspace_id", "instance_key");

-- CreateIndex
CREATE UNIQUE INDEX "workers_workspace_id_id_key" ON "workers"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "worker_credentials_secret_hash_key" ON "worker_credentials"("secret_hash");

-- CreateIndex
CREATE INDEX "worker_credentials_worker_revoked_idx" ON "worker_credentials"("worker_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "worker_enrollment_tokens_hash_key" ON "worker_enrollment_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "worker_enrollment_tokens_expiry_idx" ON "worker_enrollment_tokens"("workspace_id", "expires_at");

-- CreateIndex
CREATE INDEX "worker_enrollment_tokens_creator_idx" ON "worker_enrollment_tokens"("created_by_user_id");

-- CreateIndex
CREATE INDEX "devices_worker_status_idx" ON "devices"("worker_id", "status");

-- CreateIndex
CREATE INDEX "devices_workspace_last_seen_idx" ON "devices"("workspace_id", "last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "devices_workspace_adb_serial_key" ON "devices"("workspace_id", "adb_serial");

-- CreateIndex
CREATE UNIQUE INDEX "devices_workspace_id_id_key" ON "devices"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "device_sessions_worker_idx" ON "device_sessions"("workspace_id", "worker_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_sessions_workspace_id_id_key" ON "device_sessions"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "media_assets_workspace_status_created_idx" ON "media_assets"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "media_assets_workspace_filename_idx" ON "media_assets"("workspace_id", "original_filename");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_workspace_sha256_key" ON "media_assets"("workspace_id", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_workspace_storage_key_key" ON "media_assets"("workspace_id", "storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_workspace_id_id_key" ON "media_assets"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "datasets_creator_idx" ON "datasets"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "datasets_workspace_name_key" ON "datasets"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "datasets_workspace_id_id_key" ON "datasets"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "dataset_items_media_idx" ON "dataset_items"("workspace_id", "media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_items_dataset_media_key" ON "dataset_items"("dataset_id", "media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_items_dataset_position_key" ON "dataset_items"("dataset_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_items_workspace_id_id_key" ON "dataset_items"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "schedules_status_next_run_idx" ON "schedules"("status", "next_run_at");

-- CreateIndex
CREATE INDEX "schedules_creator_idx" ON "schedules"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_workspace_name_key" ON "schedules"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_workspace_id_id_key" ON "schedules"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "projects_dataset_idx" ON "projects"("workspace_id", "dataset_id");

-- CreateIndex
CREATE INDEX "projects_account_idx" ON "projects"("workspace_id", "account_id");

-- CreateIndex
CREATE INDEX "projects_preferred_device_idx" ON "projects"("workspace_id", "preferred_device_id");

-- CreateIndex
CREATE INDEX "projects_schedule_idx" ON "projects"("workspace_id", "schedule_id");

-- CreateIndex
CREATE INDEX "projects_creator_idx" ON "projects"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspace_name_key" ON "projects"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspace_id_id_key" ON "projects"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "project_items_dataset_item_idx" ON "project_items"("workspace_id", "dataset_item_id");

-- CreateIndex
CREATE INDEX "project_items_media_idx" ON "project_items"("workspace_id", "media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_items_project_dataset_item_key" ON "project_items"("project_id", "dataset_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_items_project_position_key" ON "project_items"("project_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "project_items_workspace_id_id_key" ON "project_items"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "product_references_account_display_idx" ON "product_references"("workspace_id", "account_id", "display_name");

-- CreateIndex
CREATE UNIQUE INDEX "product_references_workspace_id_id_key" ON "product_references"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "project_item_products_product_idx" ON "project_item_products"("workspace_id", "product_reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_item_products_position_key" ON "project_item_products"("project_item_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_runs_occurrence_key" ON "schedule_runs"("schedule_id", "scheduled_for", "local_occurrence");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_runs_workspace_id_id_key" ON "schedule_runs"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "publish_jobs_queue_idx" ON "publish_jobs"("status", "available_at", "priority", "workspace_id");

-- CreateIndex
CREATE INDEX "publish_jobs_workspace_created_idx" ON "publish_jobs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "publish_jobs_project_status_idx" ON "publish_jobs"("workspace_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "publish_jobs_account_status_idx" ON "publish_jobs"("workspace_id", "account_id", "status");

-- CreateIndex
CREATE INDEX "publish_jobs_project_item_idx" ON "publish_jobs"("workspace_id", "project_item_id");

-- CreateIndex
CREATE INDEX "publish_jobs_media_idx" ON "publish_jobs"("workspace_id", "media_asset_id");

-- CreateIndex
CREATE INDEX "publish_jobs_device_idx" ON "publish_jobs"("workspace_id", "device_id");

-- CreateIndex
CREATE INDEX "publish_jobs_schedule_run_idx" ON "publish_jobs"("workspace_id", "schedule_run_id");

-- CreateIndex
CREATE INDEX "publish_jobs_retry_of_idx" ON "publish_jobs"("workspace_id", "retry_of_job_id");

-- CreateIndex
CREATE INDEX "publish_jobs_creator_idx" ON "publish_jobs"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "publish_jobs_workspace_idempotency_key" ON "publish_jobs"("workspace_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "publish_jobs_workspace_id_id_key" ON "publish_jobs"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "publish_attempts_worker_idx" ON "publish_attempts"("workspace_id", "worker_id");

-- CreateIndex
CREATE INDEX "publish_attempts_device_idx" ON "publish_attempts"("workspace_id", "device_id");

-- CreateIndex
CREATE UNIQUE INDEX "publish_attempts_job_number_key" ON "publish_attempts"("job_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "publish_attempts_workspace_id_id_key" ON "publish_attempts"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "publish_attempts_workspace_job_id_key" ON "publish_attempts"("workspace_id", "job_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "publish_results_attempt_key" ON "publish_results"("attempt_id");

-- CreateIndex
CREATE INDEX "publish_results_job_idx" ON "publish_results"("workspace_id", "job_id");

-- CreateIndex
CREATE UNIQUE INDEX "publish_results_workspace_id_id_key" ON "publish_results"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "publish_results_workspace_job_attempt_key" ON "publish_results"("workspace_id", "job_id", "attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_leases_token_hash_key" ON "job_leases"("lease_token_hash");

-- CreateIndex
CREATE INDEX "job_leases_worker_idx" ON "job_leases"("workspace_id", "worker_id");

-- CreateIndex
CREATE INDEX "job_leases_device_idx" ON "job_leases"("workspace_id", "device_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_leases_workspace_id_id_key" ON "job_leases"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "job_leases_workspace_job_id_key" ON "job_leases"("workspace_id", "job_id", "id");

-- CreateIndex
CREATE INDEX "device_leases_worker_idx" ON "device_leases"("workspace_id", "worker_id");

-- CreateIndex
CREATE INDEX "device_leases_job_idx" ON "device_leases"("workspace_id", "job_id");

-- CreateIndex
CREATE INDEX "device_leases_job_lease_idx" ON "device_leases"("workspace_id", "job_id", "job_lease_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_leases_workspace_id_id_key" ON "device_leases"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "job_events_workspace_created_idx" ON "job_events"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "job_events_job_created_idx" ON "job_events"("job_id", "created_at");

-- CreateIndex
CREATE INDEX "job_events_attempt_idx" ON "job_events"("workspace_id", "job_id", "attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_events_job_sequence_key" ON "job_events"("job_id", "sequence");

-- CreateIndex
CREATE INDEX "audit_logs_workspace_created_idx" ON "audit_logs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "outbox_events_dispatch_idx" ON "outbox_events"("published_at", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_workspace_idx" ON "outbox_events"("workspace_id");

-- CreateIndex
CREATE INDEX "system_settings_updater_idx" ON "system_settings"("updated_by_user_id");

-- CreateIndex
CREATE INDEX "workspace_settings_updater_idx" ON "workspace_settings"("updated_by_user_id");

-- AddForeignKey
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_system_roles" ADD CONSTRAINT "user_system_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_system_roles" ADD CONSTRAINT "user_system_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_system_roles" ADD CONSTRAINT "user_system_roles_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopee_accounts" ADD CONSTRAINT "shopee_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopee_accounts" ADD CONSTRAINT "shopee_accounts_workspace_id_bound_device_id_fkey" FOREIGN KEY ("workspace_id", "bound_device_id") REFERENCES "devices"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_credentials" ADD CONSTRAINT "worker_credentials_workspace_id_worker_id_fkey" FOREIGN KEY ("workspace_id", "worker_id") REFERENCES "workers"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_enrollment_tokens" ADD CONSTRAINT "worker_enrollment_tokens_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_enrollment_tokens" ADD CONSTRAINT "worker_enrollment_tokens_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_workspace_id_worker_id_fkey" FOREIGN KEY ("workspace_id", "worker_id") REFERENCES "workers"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_workspace_id_device_id_fkey" FOREIGN KEY ("workspace_id", "device_id") REFERENCES "devices"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_workspace_id_worker_id_fkey" FOREIGN KEY ("workspace_id", "worker_id") REFERENCES "workers"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_workspace_id_expected_account_id_fkey" FOREIGN KEY ("workspace_id", "expected_account_id") REFERENCES "shopee_accounts"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_items" ADD CONSTRAINT "dataset_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_items" ADD CONSTRAINT "dataset_items_workspace_id_dataset_id_fkey" FOREIGN KEY ("workspace_id", "dataset_id") REFERENCES "datasets"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_items" ADD CONSTRAINT "dataset_items_workspace_id_media_asset_id_fkey" FOREIGN KEY ("workspace_id", "media_asset_id") REFERENCES "media_assets"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_dataset_id_fkey" FOREIGN KEY ("workspace_id", "dataset_id") REFERENCES "datasets"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_account_id_fkey" FOREIGN KEY ("workspace_id", "account_id") REFERENCES "shopee_accounts"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_preferred_device_id_fkey" FOREIGN KEY ("workspace_id", "preferred_device_id") REFERENCES "devices"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_schedule_id_fkey" FOREIGN KEY ("workspace_id", "schedule_id") REFERENCES "schedules"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_workspace_id_project_id_fkey" FOREIGN KEY ("workspace_id", "project_id") REFERENCES "projects"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_workspace_id_dataset_item_id_fkey" FOREIGN KEY ("workspace_id", "dataset_item_id") REFERENCES "dataset_items"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_workspace_id_media_asset_id_fkey" FOREIGN KEY ("workspace_id", "media_asset_id") REFERENCES "media_assets"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_references" ADD CONSTRAINT "product_references_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_references" ADD CONSTRAINT "product_references_workspace_id_account_id_fkey" FOREIGN KEY ("workspace_id", "account_id") REFERENCES "shopee_accounts"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_item_products" ADD CONSTRAINT "project_item_products_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_item_products" ADD CONSTRAINT "project_item_products_workspace_id_project_item_id_fkey" FOREIGN KEY ("workspace_id", "project_item_id") REFERENCES "project_items"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_item_products" ADD CONSTRAINT "project_item_products_workspace_id_product_reference_id_fkey" FOREIGN KEY ("workspace_id", "product_reference_id") REFERENCES "product_references"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_runs" ADD CONSTRAINT "schedule_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_runs" ADD CONSTRAINT "schedule_runs_workspace_id_schedule_id_fkey" FOREIGN KEY ("workspace_id", "schedule_id") REFERENCES "schedules"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_workspace_id_project_id_fkey" FOREIGN KEY ("workspace_id", "project_id") REFERENCES "projects"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_workspace_id_project_item_id_fkey" FOREIGN KEY ("workspace_id", "project_item_id") REFERENCES "project_items"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_workspace_id_account_id_fkey" FOREIGN KEY ("workspace_id", "account_id") REFERENCES "shopee_accounts"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_workspace_id_media_asset_id_fkey" FOREIGN KEY ("workspace_id", "media_asset_id") REFERENCES "media_assets"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_workspace_id_device_id_fkey" FOREIGN KEY ("workspace_id", "device_id") REFERENCES "devices"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_workspace_id_schedule_run_id_fkey" FOREIGN KEY ("workspace_id", "schedule_run_id") REFERENCES "schedule_runs"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_workspace_id_retry_of_job_id_fkey" FOREIGN KEY ("workspace_id", "retry_of_job_id") REFERENCES "publish_jobs"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_workspace_id_job_id_fkey" FOREIGN KEY ("workspace_id", "job_id") REFERENCES "publish_jobs"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_workspace_id_worker_id_fkey" FOREIGN KEY ("workspace_id", "worker_id") REFERENCES "workers"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_workspace_id_device_id_fkey" FOREIGN KEY ("workspace_id", "device_id") REFERENCES "devices"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_results" ADD CONSTRAINT "publish_results_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_results" ADD CONSTRAINT "publish_results_workspace_id_job_id_fkey" FOREIGN KEY ("workspace_id", "job_id") REFERENCES "publish_jobs"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_results" ADD CONSTRAINT "publish_results_workspace_id_job_id_attempt_id_fkey" FOREIGN KEY ("workspace_id", "job_id", "attempt_id") REFERENCES "publish_attempts"("workspace_id", "job_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_leases" ADD CONSTRAINT "job_leases_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_leases" ADD CONSTRAINT "job_leases_workspace_id_job_id_fkey" FOREIGN KEY ("workspace_id", "job_id") REFERENCES "publish_jobs"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_leases" ADD CONSTRAINT "job_leases_workspace_id_worker_id_fkey" FOREIGN KEY ("workspace_id", "worker_id") REFERENCES "workers"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_leases" ADD CONSTRAINT "job_leases_workspace_id_device_id_fkey" FOREIGN KEY ("workspace_id", "device_id") REFERENCES "devices"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_leases" ADD CONSTRAINT "device_leases_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_leases" ADD CONSTRAINT "device_leases_workspace_id_device_id_fkey" FOREIGN KEY ("workspace_id", "device_id") REFERENCES "devices"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_leases" ADD CONSTRAINT "device_leases_workspace_id_worker_id_fkey" FOREIGN KEY ("workspace_id", "worker_id") REFERENCES "workers"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_leases" ADD CONSTRAINT "device_leases_workspace_id_job_id_fkey" FOREIGN KEY ("workspace_id", "job_id") REFERENCES "publish_jobs"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_leases" ADD CONSTRAINT "device_leases_workspace_id_job_id_job_lease_id_fkey" FOREIGN KEY ("workspace_id", "job_id", "job_lease_id") REFERENCES "job_leases"("workspace_id", "job_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_workspace_id_job_id_fkey" FOREIGN KEY ("workspace_id", "job_id") REFERENCES "publish_jobs"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_workspace_id_job_id_attempt_id_fkey" FOREIGN KEY ("workspace_id", "job_id", "attempt_id") REFERENCES "publish_attempts"("workspace_id", "job_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_dispatch_state" ADD CONSTRAINT "workspace_dispatch_state_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
