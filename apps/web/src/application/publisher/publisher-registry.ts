import {
  PublisherKindSchema,
  normalizePublisherCapabilities,
  type FeatureFlags,
  type PublisherCapabilities,
  type PublisherKind,
} from "@otshop/shared";

import { MOCK_CAPABILITIES, MockPublisher, type MockScenario } from "./mock-publisher";
import type { Publisher } from "./publisher";
import { PublisherUnavailableError } from "./publisher-errors";

export interface PublisherDescriptor {
  readonly available: boolean;
  readonly capabilities: PublisherCapabilities;
  readonly enabledByFeatureFlags: boolean;
  readonly kind: PublisherKind;
  readonly registered: boolean;
  readonly realPublisher: boolean;
}

const unavailableCapabilities = normalizePublisherCapabilities({});

export class PublisherRegistry {
  private readonly mock = new MockPublisher();

  constructor(private readonly features: FeatureFlags) {}

  list(): readonly PublisherDescriptor[] {
    return Object.freeze([
      {
        kind: "MOCK",
        registered: true,
        available: true,
        enabledByFeatureFlags: true,
        realPublisher: false,
        capabilities: MOCK_CAPABILITIES,
      },
      {
        kind: "SHOPEE_ANDROID",
        registered: true,
        available: false,
        enabledByFeatureFlags:
          this.features.shopeeAndroidEnabled &&
          this.features.realPublishEnabled &&
          this.features.workerProtocolEnabled &&
          this.features.workerRealPublishAllowed,
        realPublisher: true,
        capabilities: unavailableCapabilities,
      },
      {
        kind: "SHOPEE_OFFICIAL_API",
        registered: true,
        available: false,
        enabledByFeatureFlags:
          this.features.shopeeOfficialApiEnabled && this.features.realPublishEnabled,
        realPublisher: true,
        capabilities: unavailableCapabilities,
      },
    ]);
  }

  resolve(kind: unknown): Publisher {
    const parsed = PublisherKindSchema.safeParse(kind);
    if (!parsed.success || parsed.data !== "MOCK") throw new PublisherUnavailableError();
    return this.mock;
  }

  resolveMockScenario(scenario: MockScenario): MockPublisher {
    return new MockPublisher(scenario);
  }

  descriptor(kind: unknown): PublisherDescriptor {
    const parsed = PublisherKindSchema.safeParse(kind);
    if (!parsed.success) throw new PublisherUnavailableError();
    const descriptor = this.list().find((candidate) => candidate.kind === parsed.data);
    if (descriptor === undefined) throw new PublisherUnavailableError();
    return descriptor;
  }
}
