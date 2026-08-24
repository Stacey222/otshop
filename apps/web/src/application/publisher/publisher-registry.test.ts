import { describe, expect, it } from "vitest";

import type { FeatureFlags } from "@otshop/shared";

import { PublisherUnavailableError } from "./publisher-errors";
import { PublisherRegistry } from "./publisher-registry";

const disabledFeatures: FeatureFlags = {
  realPublishEnabled: false,
  schedulerEnabled: false,
  shopeeAndroidEnabled: false,
  shopeeOfficialApiEnabled: false,
  workerProtocolEnabled: false,
  workerRealPublishAllowed: false,
};

describe("fail-closed publisher registry", () => {
  it("registers only the mock as available", () => {
    const registry = new PublisherRegistry(disabledFeatures);
    expect(registry.list()).toMatchObject([
      { kind: "MOCK", registered: true, available: true, realPublisher: false },
      {
        kind: "SHOPEE_ANDROID",
        registered: true,
        available: false,
        enabledByFeatureFlags: false,
      },
      {
        kind: "SHOPEE_OFFICIAL_API",
        registered: true,
        available: false,
        enabledByFeatureFlags: false,
      },
    ]);
    expect(registry.resolve("MOCK").kind).toBe("MOCK");
  });

  it.each(["SHOPEE_ANDROID", "SHOPEE_OFFICIAL_API", "UNKNOWN", null])(
    "never executes unavailable or unknown publisher %s",
    (kind) => {
      expect(() => new PublisherRegistry(disabledFeatures).resolve(kind)).toThrow(
        PublisherUnavailableError,
      );
    },
  );

  it("does not create a real adapter even if every gate is hypothetically true", () => {
    const registry = new PublisherRegistry({
      ...disabledFeatures,
      realPublishEnabled: true,
      shopeeAndroidEnabled: true,
      shopeeOfficialApiEnabled: true,
      workerProtocolEnabled: true,
      workerRealPublishAllowed: true,
    });
    expect(registry.list().filter(({ realPublisher }) => realPublisher)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ available: false }),
        expect.objectContaining({ available: false }),
      ]),
    );
  });
});
