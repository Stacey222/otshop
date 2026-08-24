import { ApplicationError } from "@/application/errors/application-error";

export class PublisherUnavailableError extends ApplicationError {
  constructor() {
    super({
      category: "NON_RETRYABLE",
      code: "FEATURE_NOT_AVAILABLE",
      message: "The requested publisher is unavailable",
      retryable: false,
    });
  }
}

export class PublisherCapabilityError extends ApplicationError {
  constructor() {
    super({
      category: "NON_RETRYABLE",
      code: "PUBLISHER_CAPABILITY_UNSUPPORTED",
      message: "The publisher does not support the requested operation",
      retryable: false,
    });
  }
}

export class MockExecutionUnavailableError extends ApplicationError {
  constructor() {
    super({
      category: "NON_RETRYABLE",
      code: "FEATURE_NOT_AVAILABLE",
      message: "Mock scenario execution is unavailable in production",
      retryable: false,
    });
  }
}
