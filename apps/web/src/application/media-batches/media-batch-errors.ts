import { ApplicationError } from "@/application/errors/application-error";

class SafeBatchError extends ApplicationError {
  constructor(code: string, message: string) {
    super({ category: "NON_RETRYABLE", code, message, retryable: false });
  }
}

export class MediaBatchNotFoundError extends SafeBatchError {
  constructor() {
    super("MEDIA_BATCH_NOT_FOUND", "The media batch was not found");
  }
}

export class MediaBatchConflictError extends SafeBatchError {
  constructor() {
    super("MEDIA_BATCH_CONFLICT", "The media batch changed before the operation completed");
  }
}

export class MediaBatchLimitError extends SafeBatchError {
  constructor() {
    super("MEDIA_BATCH_LIMIT", "The media batch exceeds a configured safety limit");
  }
}

export class MediaBatchNotFinalizableError extends SafeBatchError {
  constructor() {
    super(
      "MEDIA_BATCH_NOT_FINALIZABLE",
      "The media batch cannot be finalized in its current state",
    );
  }
}

export class MediaBatchItemConflictError extends SafeBatchError {
  constructor() {
    super("MEDIA_BATCH_ITEM_CONFLICT", "The batch input index has already been submitted");
  }
}

export class InvalidMediaBatchPaginationError extends SafeBatchError {
  constructor() {
    super("INVALID_MEDIA_BATCH_PAGINATION", "The batch result pagination is invalid");
  }
}

export class MediaBatchPersistenceFailureError extends ApplicationError {
  constructor() {
    super({
      category: "RETRYABLE",
      code: "MEDIA_BATCH_PERSISTENCE_FAILURE",
      message: "The media batch could not be saved safely",
      retryable: true,
    });
  }
}
