import { ApplicationError } from "@/application/errors/application-error";

class DatasetError extends ApplicationError {
  constructor(code: string, message: string) {
    super({ category: "NON_RETRYABLE", code, message, retryable: false });
  }
}

export class DatasetNotFoundError extends DatasetError {
  constructor() {
    super("DATASET_NOT_FOUND", "The dataset was not found");
  }
}

export class DatasetArchivedError extends DatasetError {
  constructor() {
    super("DATASET_ARCHIVED", "The archived dataset is read-only");
  }
}

export class DatasetConflictError extends DatasetError {
  constructor() {
    super("DATASET_CONFLICT", "The dataset changed before the operation completed");
  }
}

export class DatasetItemNotFoundError extends DatasetError {
  constructor() {
    super("DATASET_ITEM_NOT_FOUND", "The dataset item was not found");
  }
}

export class DatasetMediaNotReadyError extends DatasetError {
  constructor() {
    super("DATASET_MEDIA_NOT_READY", "The media asset is not ready for this dataset");
  }
}

export class DatasetDuplicateMediaError extends DatasetError {
  constructor() {
    super("DATASET_DUPLICATE_MEDIA", "The media asset is already in this dataset");
  }
}

export class InvalidDatasetOrderError extends DatasetError {
  constructor() {
    super("INVALID_DATASET_ORDER", "The dataset item order is invalid");
  }
}

export class DatasetItemLimitError extends DatasetError {
  constructor() {
    super("DATASET_ITEM_LIMIT", "The dataset item limit has been reached");
  }
}

export class InvalidDatasetPaginationError extends DatasetError {
  constructor() {
    super("INVALID_DATASET_PAGINATION", "The dataset pagination parameters are invalid");
  }
}

export class DatasetPersistenceFailureError extends ApplicationError {
  constructor() {
    super({
      category: "RETRYABLE",
      code: "DATASET_PERSISTENCE_FAILURE",
      message: "The dataset operation could not be completed safely",
      retryable: true,
    });
  }
}
