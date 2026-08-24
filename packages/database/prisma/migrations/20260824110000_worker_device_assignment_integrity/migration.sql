-- A worker/device pair must describe the device's actual owning worker.
CREATE UNIQUE INDEX "devices_workspace_worker_id_key"
  ON "devices" ("workspace_id", "worker_id", "id");

ALTER TABLE "device_sessions"
  DROP CONSTRAINT "device_sessions_workspace_id_device_id_fkey";
ALTER TABLE "device_sessions"
  ADD CONSTRAINT "device_sessions_workspace_id_worker_id_device_id_fkey"
  FOREIGN KEY ("workspace_id", "worker_id", "device_id")
  REFERENCES "devices" ("workspace_id", "worker_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "publish_attempts"
  DROP CONSTRAINT "publish_attempts_workspace_id_device_id_fkey";
ALTER TABLE "publish_attempts"
  ADD CONSTRAINT "publish_attempts_workspace_id_worker_id_device_id_fkey"
  FOREIGN KEY ("workspace_id", "worker_id", "device_id")
  REFERENCES "devices" ("workspace_id", "worker_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "job_leases"
  DROP CONSTRAINT "job_leases_workspace_id_device_id_fkey";
ALTER TABLE "job_leases"
  ADD CONSTRAINT "job_leases_workspace_id_worker_id_device_id_fkey"
  FOREIGN KEY ("workspace_id", "worker_id", "device_id")
  REFERENCES "devices" ("workspace_id", "worker_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "job_leases_assignment_id_key"
  ON "job_leases" ("workspace_id", "job_id", "worker_id", "device_id", "id");

ALTER TABLE "device_leases"
  DROP CONSTRAINT "device_leases_workspace_id_device_id_fkey",
  DROP CONSTRAINT "device_leases_workspace_id_job_id_job_lease_id_fkey";
ALTER TABLE "device_leases"
  ADD CONSTRAINT "device_leases_workspace_id_worker_id_device_id_fkey"
  FOREIGN KEY ("workspace_id", "worker_id", "device_id")
  REFERENCES "devices" ("workspace_id", "worker_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "device_leases_assignment_job_lease_id_fkey"
  FOREIGN KEY ("workspace_id", "job_id", "worker_id", "device_id", "job_lease_id")
  REFERENCES "job_leases" ("workspace_id", "job_id", "worker_id", "device_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
