import {
  PublishRequestSchema,
  PublisherCapabilitiesSchema,
  publisherCapabilityNames,
  type PublishRequest,
  type PublisherCapabilities,
  type PublisherCapability,
  type PublisherKind,
} from "@otshop/shared";

export interface PublisherPreflightResult {
  readonly available: boolean;
  readonly missingCapabilities: readonly PublisherCapability[];
  readonly publisherKind: PublisherKind;
  readonly ready: boolean;
  readonly requiredCapabilities: readonly PublisherCapability[];
  readonly supportedCapabilities: readonly PublisherCapability[];
}

export function deriveRequiredCapabilities(
  request: PublishRequest,
): readonly PublisherCapability[] {
  const canonical = PublishRequestSchema.parse(request);
  const required: PublisherCapability[] = ["VIDEO_UPLOAD"];
  if (canonical.caption !== null) required.push("CAPTION");
  if (canonical.products.length > 0) required.push("PRODUCT_ATTACHMENT");
  return Object.freeze(required);
}

export function preflightPublisher(input: {
  readonly available: boolean;
  readonly capabilities: PublisherCapabilities;
  readonly publisherKind: PublisherKind;
  readonly request: PublishRequest;
}): PublisherPreflightResult {
  const capabilities = PublisherCapabilitiesSchema.parse(input.capabilities);
  const requiredCapabilities = deriveRequiredCapabilities(input.request);
  const supportedCapabilities = publisherCapabilityNames.filter(
    (capability) => capabilities[capability] === "SUPPORTED",
  );
  const missingCapabilities = requiredCapabilities.filter(
    (capability) => capabilities[capability] !== "SUPPORTED",
  );
  return Object.freeze({
    available: input.available,
    publisherKind: input.publisherKind,
    requiredCapabilities,
    supportedCapabilities: Object.freeze(supportedCapabilities),
    missingCapabilities: Object.freeze(missingCapabilities),
    ready: input.available && missingCapabilities.length === 0,
  });
}
