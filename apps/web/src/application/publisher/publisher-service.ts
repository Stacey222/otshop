import {
  PublishRequestSchema,
  hasPermission,
  isRetryablePublisherError,
  type AuthenticatedContext,
  type PublishRequest,
  type PublishResult,
  type PublisherKind,
  type RequestId,
} from "@otshop/shared";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import { ApplicationError } from "@/application/errors/application-error";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";

import { MockScenarioSchema, type MockScenario } from "./mock-publisher";
import { preflightPublisher, type PublisherPreflightResult } from "./capability-preflight";
import { MockExecutionUnavailableError, PublisherCapabilityError } from "./publisher-errors";
import type { PublisherDescriptor, PublisherRegistry } from "./publisher-registry";

export class PublisherService {
  constructor(
    private readonly registry: PublisherRegistry,
    private readonly log: ApplicationLogger,
    private readonly nodeEnv: "development" | "production" | "test",
  ) {}

  private authorize(context: AuthenticatedContext): void {
    if (!hasPermission(context.role, "projects.run")) throw new AuthorizationDeniedError();
  }

  private canonicalRequest(
    context: AuthenticatedContext,
    request: PublishRequest,
    requestId: RequestId,
  ): PublishRequest {
    const parsed = PublishRequestSchema.parse(request);
    if (parsed.workspaceId !== context.workspaceId) throw new AuthorizationDeniedError();
    return PublishRequestSchema.parse({
      ...parsed,
      workspaceId: context.workspaceId,
      requestId,
    });
  }

  listPublishers(context: AuthenticatedContext): readonly PublisherDescriptor[] {
    if (!hasPermission(context.role, "workspace.read")) throw new AuthorizationDeniedError();
    return this.registry.list();
  }

  async preflight(input: {
    readonly context: AuthenticatedContext;
    readonly publisherKind: PublisherKind;
    readonly request: PublishRequest;
    readonly requestId: RequestId;
  }): Promise<PublisherPreflightResult> {
    this.authorize(input.context);
    const request = this.canonicalRequest(input.context, input.request, input.requestId);
    const descriptor = this.registry.descriptor(input.publisherKind);
    const publisher = this.registry.resolve(input.publisherKind);
    const result = preflightPublisher({
      available: descriptor.available,
      publisherKind: input.publisherKind,
      capabilities: await publisher.getCapabilities(),
      request,
    });
    this.log.info("publisher.preflight.completed", {
      requestId: input.requestId,
      workspaceId: input.context.workspaceId,
      publisherId: input.publisherKind,
      operation: "preflight",
      ready: result.ready,
      missingCapabilityCount: result.missingCapabilities.length,
    });
    return result;
  }

  async executeMock(input: {
    readonly context: AuthenticatedContext;
    readonly request: PublishRequest;
    readonly requestId: RequestId;
    readonly scenario: MockScenario;
  }): Promise<PublishResult> {
    this.authorize(input.context);
    if (this.nodeEnv === "production") throw new MockExecutionUnavailableError();
    const scenario = MockScenarioSchema.parse(input.scenario);
    const request = this.canonicalRequest(input.context, input.request, input.requestId);
    if (request.mode !== "MOCK") throw new PublisherCapabilityError();
    const publisher = this.registry.resolveMockScenario(scenario);
    const preflight = preflightPublisher({
      available: true,
      publisherKind: "MOCK",
      capabilities: await publisher.getCapabilities(),
      request,
    });
    if (!preflight.ready) throw new PublisherCapabilityError();
    const startedAt = performance.now();
    const result = await publisher.publish(request);
    this.log.info("publisher.mock.completed", {
      requestId: input.requestId,
      workspaceId: input.context.workspaceId,
      publisherId: "MOCK",
      operation: "publish",
      scenario,
      resultCategory: result.ok ? "SUCCESS" : result.error.category,
      durationMs: Math.round(performance.now() - startedAt),
    });
    if (!result.ok) {
      throw new ApplicationError({
        category: result.error.category,
        code: result.error.code,
        message: result.error.safeMessage,
        retryable: isRetryablePublisherError(result.error),
      });
    }
    return result;
  }
}
