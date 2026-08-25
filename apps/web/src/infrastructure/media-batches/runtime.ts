import "server-only";

import { getAppConfig } from "@otshop/config";
import { MediaImportBatchRepository } from "@otshop/database";

import { MediaImportBatchService } from "@/application/media-batches/media-batch-service";
import { getDatasetService } from "@/infrastructure/datasets/runtime";
import { logger } from "@/infrastructure/logging/logger";
import { getMediaIngestService, getMediaInspectionService } from "@/infrastructure/media/runtime";

let service: MediaImportBatchService | undefined;

export function getMediaImportBatchService(): MediaImportBatchService {
  const config = getAppConfig();
  service ??= new MediaImportBatchService(
    new MediaImportBatchRepository(),
    getMediaIngestService(),
    getMediaInspectionService(),
    getDatasetService(),
    {
      maximumFiles: config.mediaBatchMaxFiles,
      maximumTotalBytes: config.mediaBatchMaxTotalBytes,
      maximumConcurrency: config.mediaBatchMaxConcurrency,
      maximumIndividualBytes: config.maxMediaUploadBytes,
    },
    logger,
  );
  return service;
}
