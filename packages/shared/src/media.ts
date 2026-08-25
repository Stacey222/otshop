import { z } from "zod";

export const mediaInspectionStatuses = [
  "INGESTED",
  "INSPECTING",
  "READY",
  "REJECTED",
  "INSPECTION_FAILED",
] as const;

export const MediaInspectionStatusSchema = z.enum(mediaInspectionStatuses);
export type MediaInspectionStatus = z.infer<typeof MediaInspectionStatusSchema>;

export const mediaOrientations = [
  "ROTATION_0",
  "ROTATION_90",
  "ROTATION_180",
  "ROTATION_270",
] as const;

export const MediaOrientationSchema = z.enum(mediaOrientations);
export type MediaOrientation = z.infer<typeof MediaOrientationSchema>;

export const mediaInspectionFailureCodes = [
  "CONTAINER_UNSUPPORTED",
  "DURATION_INVALID",
  "DIMENSIONS_INVALID",
  "FRAME_RATE_INVALID",
  "NO_VIDEO_STREAM",
  "OUTPUT_LIMIT_EXCEEDED",
  "PROBE_INVALID_MEDIA",
  "PROBE_OUTPUT_INVALID",
  "STORAGE_READ_FAILED",
  "SYSTEM_FAILURE",
  "TIMEOUT",
  "UNSUPPORTED_AUDIO_CODEC",
  "UNSUPPORTED_PIXEL_FORMAT",
  "UNSUPPORTED_VIDEO_CODEC",
] as const;

export const MediaInspectionFailureCodeSchema = z.enum(mediaInspectionFailureCodes);
export type MediaInspectionFailureCode = z.infer<typeof MediaInspectionFailureCodeSchema>;
