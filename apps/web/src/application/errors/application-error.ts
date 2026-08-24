import type { ApplicationErrorShape, ErrorCategory, SafeMetadata } from "@otshop/shared";

interface ApplicationErrorInput {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly safeMetadata?: SafeMetadata;
}

export class ApplicationError extends Error implements ApplicationErrorShape {
  override readonly name = "ApplicationError";
  readonly category: ErrorCategory;
  readonly code: string;
  readonly retryable: boolean;
  readonly safeMetadata: SafeMetadata;

  constructor(input: ApplicationErrorInput) {
    super(input.message);
    this.category = input.category;
    this.code = input.code;
    this.retryable = input.retryable;
    this.safeMetadata = input.safeMetadata ?? {};
  }

  toSafeResponse(): ApplicationErrorShape {
    return {
      category: this.category,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      safeMetadata: this.safeMetadata,
    };
  }
}
