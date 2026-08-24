import "server-only";

import { getAppConfig } from "@otshop/config";

import { PublisherRegistry } from "@/application/publisher/publisher-registry";
import { PublisherService } from "@/application/publisher/publisher-service";
import { logger } from "@/infrastructure/logging/logger";

let registry: PublisherRegistry | undefined;
let service: PublisherService | undefined;

export function getPublisherRegistry(): PublisherRegistry {
  registry ??= new PublisherRegistry(getAppConfig().features);
  return registry;
}

export function getPublisherService(): PublisherService {
  const config = getAppConfig();
  service ??= new PublisherService(getPublisherRegistry(), logger, config.nodeEnv);
  return service;
}
