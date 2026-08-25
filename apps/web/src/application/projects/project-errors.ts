import { ApplicationError } from "@/application/errors/application-error";

class SafeProjectError extends ApplicationError {
  constructor(code: string, message: string) {
    super({ category: "NON_RETRYABLE", code, message, retryable: false });
  }
}

export class ProjectNotFoundError extends SafeProjectError {
  constructor() {
    super("PROJECT_NOT_FOUND", "The project was not found");
  }
}

export class ProjectArchivedError extends SafeProjectError {
  constructor() {
    super("PROJECT_ARCHIVED", "The archived project is read-only");
  }
}

export class ProjectConflictError extends SafeProjectError {
  constructor() {
    super("PROJECT_CONFLICT", "The project changed before the operation completed");
  }
}

export class ProjectInvalidDatasetError extends SafeProjectError {
  constructor() {
    super("PROJECT_INVALID_DATASET", "The project dataset is not available");
  }
}

export class ProjectInvalidAccountError extends SafeProjectError {
  constructor() {
    super("PROJECT_INVALID_ACCOUNT", "The project account reference is not available");
  }
}

export class ProjectNotConfigurableError extends SafeProjectError {
  constructor() {
    super("PROJECT_NOT_CONFIGURABLE", "The project configuration is incomplete");
  }
}

export class InvalidProjectPaginationError extends SafeProjectError {
  constructor() {
    super("INVALID_PROJECT_PAGINATION", "The project pagination parameters are invalid");
  }
}

export class ProjectPersistenceFailureError extends ApplicationError {
  constructor() {
    super({
      category: "RETRYABLE",
      code: "PROJECT_PERSISTENCE_FAILURE",
      message: "The project operation could not be completed safely",
      retryable: true,
    });
  }
}
