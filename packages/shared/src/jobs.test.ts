import { describe, expect, it } from "vitest";

import {
  JOB_STATE_TRANSITIONS,
  PublishJobStateSchema,
  canTransition,
  isTerminalPublishJobState,
  publishJobStates,
  terminalPublishJobStates,
} from "./jobs";

describe("publish job state contracts", () => {
  it("contains exactly the authoritative states", () => {
    expect(PublishJobStateSchema.options).toEqual(publishJobStates);
    expect(PublishJobStateSchema.safeParse("RUNNING").success).toBe(false);
  });

  it("matches the complete Phase 1 transition table", () => {
    expect(JOB_STATE_TRANSITIONS).toEqual({
      DRAFT: ["QUEUED", "CANCELLED"],
      QUEUED: ["PREPARING", "WAITING_FOR_DEVICE", "PAUSED", "CANCELLED"],
      PREPARING: [
        "PROCESSING_MEDIA",
        "WAITING_FOR_DEVICE",
        "WAITING_FOR_AUTH",
        "UPLOADING",
        "RETRYING",
        "PAUSED",
        "CANCELLED",
        "FAILED",
      ],
      WAITING_FOR_DEVICE: ["QUEUED", "PAUSED", "CANCELLED", "FAILED"],
      WAITING_FOR_AUTH: ["QUEUED", "PAUSED", "CANCELLED", "FAILED"],
      PROCESSING_MEDIA: ["PREPARING", "RETRYING", "PAUSED", "CANCELLED", "FAILED"],
      UPLOADING: ["VERIFYING", "RETRYING", "FAILED", "UNKNOWN_PUBLISH_STATE"],
      VERIFYING: ["SUCCESS", "RETRYING", "FAILED", "UNKNOWN_PUBLISH_STATE", "NEEDS_REVIEW"],
      SUCCESS: [],
      RETRYING: ["QUEUED", "PAUSED", "CANCELLED", "FAILED"],
      PAUSED: ["QUEUED", "CANCELLED"],
      CANCELLED: [],
      FAILED: [],
      UNKNOWN_PUBLISH_STATE: ["VERIFYING", "SUCCESS", "FAILED", "NEEDS_REVIEW"],
      NEEDS_REVIEW: ["QUEUED", "SUCCESS", "FAILED"],
    });
  });

  it("allows documented paths and fails closed for unsafe paths", () => {
    expect(canTransition("DRAFT", "QUEUED")).toBe(true);
    expect(canTransition("WAITING_FOR_DEVICE", "QUEUED")).toBe(true);
    expect(canTransition("UPLOADING", "UNKNOWN_PUBLISH_STATE")).toBe(true);
    expect(canTransition("UPLOADING", "QUEUED")).toBe(false);
    expect(canTransition("WAITING_FOR_DEVICE", "UPLOADING")).toBe(false);
    expect(canTransition("UNKNOWN_PUBLISH_STATE", "QUEUED")).toBe(false);
  });

  it("marks only success, cancellation, and failure as terminal", () => {
    expect(terminalPublishJobStates).toEqual(["SUCCESS", "CANCELLED", "FAILED"]);
    for (const state of publishJobStates) {
      expect(isTerminalPublishJobState(state)).toBe(
        terminalPublishJobStates.includes(state as never),
      );
    }
    for (const terminalState of terminalPublishJobStates) {
      expect(JOB_STATE_TRANSITIONS[terminalState]).toEqual([]);
    }
  });
});
