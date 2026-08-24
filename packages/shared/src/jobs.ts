import { z } from "zod";

export const publishJobStates = [
  "DRAFT",
  "QUEUED",
  "PREPARING",
  "WAITING_FOR_DEVICE",
  "WAITING_FOR_AUTH",
  "PROCESSING_MEDIA",
  "UPLOADING",
  "VERIFYING",
  "SUCCESS",
  "RETRYING",
  "PAUSED",
  "CANCELLED",
  "FAILED",
  "UNKNOWN_PUBLISH_STATE",
  "NEEDS_REVIEW",
] as const;

export const PublishJobStateSchema = z.enum(publishJobStates);
export type PublishJobState = z.infer<typeof PublishJobStateSchema>;

export const terminalPublishJobStates = [
  "SUCCESS",
  "CANCELLED",
  "FAILED",
] as const satisfies readonly PublishJobState[];

function freezeStates<T extends readonly PublishJobState[]>(values: T): Readonly<T> {
  return Object.freeze(values);
}

export const JOB_STATE_TRANSITIONS: Readonly<Record<PublishJobState, readonly PublishJobState[]>> =
  Object.freeze({
    DRAFT: freezeStates(["QUEUED", "CANCELLED"]),
    QUEUED: freezeStates(["PREPARING", "WAITING_FOR_DEVICE", "PAUSED", "CANCELLED"]),
    PREPARING: freezeStates([
      "PROCESSING_MEDIA",
      "WAITING_FOR_DEVICE",
      "WAITING_FOR_AUTH",
      "UPLOADING",
      "RETRYING",
      "PAUSED",
      "CANCELLED",
      "FAILED",
    ]),
    WAITING_FOR_DEVICE: freezeStates(["QUEUED", "PAUSED", "CANCELLED", "FAILED"]),
    WAITING_FOR_AUTH: freezeStates(["QUEUED", "PAUSED", "CANCELLED", "FAILED"]),
    PROCESSING_MEDIA: freezeStates(["PREPARING", "RETRYING", "PAUSED", "CANCELLED", "FAILED"]),
    UPLOADING: freezeStates(["VERIFYING", "RETRYING", "FAILED", "UNKNOWN_PUBLISH_STATE"]),
    VERIFYING: freezeStates([
      "SUCCESS",
      "RETRYING",
      "FAILED",
      "UNKNOWN_PUBLISH_STATE",
      "NEEDS_REVIEW",
    ]),
    SUCCESS: freezeStates([]),
    RETRYING: freezeStates(["QUEUED", "PAUSED", "CANCELLED", "FAILED"]),
    PAUSED: freezeStates(["QUEUED", "CANCELLED"]),
    CANCELLED: freezeStates([]),
    FAILED: freezeStates([]),
    UNKNOWN_PUBLISH_STATE: freezeStates(["VERIFYING", "SUCCESS", "FAILED", "NEEDS_REVIEW"]),
    NEEDS_REVIEW: freezeStates(["QUEUED", "SUCCESS", "FAILED"]),
  });

export function canTransition(from: PublishJobState, to: PublishJobState): boolean {
  return JOB_STATE_TRANSITIONS[from].includes(to);
}

export function isTerminalPublishJobState(state: PublishJobState): boolean {
  return terminalPublishJobStates.includes(state as (typeof terminalPublishJobStates)[number]);
}
