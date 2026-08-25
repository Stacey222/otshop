import "server-only";

import { DatasetRepository } from "@otshop/database";

import { DatasetService } from "@/application/datasets/dataset-service";
import { logger } from "@/infrastructure/logging/logger";

let service: DatasetService | undefined;

export function getDatasetService(): DatasetService {
  service ??= new DatasetService(new DatasetRepository(), logger);
  return service;
}
