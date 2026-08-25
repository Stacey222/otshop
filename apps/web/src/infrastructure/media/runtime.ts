import "server-only";

import { getAppConfig } from "@otshop/config";
import { MediaAssetRepository } from "@otshop/database";

import { MediaIngestService } from "@/application/media/media-ingest-service";
import { MediaInspectionService } from "@/application/media/media-inspection-service";
import { MediaThumbnailService } from "@/application/media/media-thumbnail-service";
import { logger } from "@/infrastructure/logging/logger";
import { LocalStorageProvider } from "@/infrastructure/storage/local-storage-provider";

import { FFprobeMediaInspector } from "./ffprobe-media-inspector";
import { FFmpegThumbnailGenerator } from "./ffmpeg-thumbnail-generator";

let repository: MediaAssetRepository | undefined;
let storage: LocalStorageProvider | undefined;
let service: MediaIngestService | undefined;
let inspectionService: MediaInspectionService | undefined;
let thumbnailService: MediaThumbnailService | undefined;

export function getMediaAssetRepository(): MediaAssetRepository {
  repository ??= new MediaAssetRepository();
  return repository;
}

export function getStorageProvider(): LocalStorageProvider {
  storage ??= new LocalStorageProvider(getAppConfig().storageRoot);
  return storage;
}

export function getMediaIngestService(): MediaIngestService {
  const config = getAppConfig();
  service ??= new MediaIngestService(
    getMediaAssetRepository(),
    getStorageProvider(),
    config.maxMediaUploadBytes,
    logger,
  );
  return service;
}

export function getMediaInspectionService(): MediaInspectionService {
  const config = getAppConfig();
  inspectionService ??= new MediaInspectionService(
    getMediaAssetRepository(),
    getStorageProvider(),
    new FFprobeMediaInspector(
      config.ffprobeExecutable,
      config.ffprobeTimeoutMs,
      config.ffprobeMaxOutputBytes,
    ),
    Math.max(60_000, config.ffprobeTimeoutMs * 2),
    logger,
  );
  return inspectionService;
}

export function getMediaThumbnailService(): MediaThumbnailService {
  const config = getAppConfig();
  thumbnailService ??= new MediaThumbnailService(
    getMediaAssetRepository(),
    getStorageProvider(),
    new FFmpegThumbnailGenerator(
      config.ffmpegExecutable,
      config.ffmpegThumbnailTimeoutMs,
      config.thumbnailMaxBytes,
      config.thumbnailMaxDimension,
      config.ffmpegMaxDiagnosticBytes,
    ),
    config.thumbnailMaxBytes,
    config.thumbnailMaxDimension,
    Math.max(60_000, config.ffmpegThumbnailTimeoutMs * 2),
    logger,
  );
  return thumbnailService;
}
