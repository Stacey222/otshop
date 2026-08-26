import { ApplicationError } from "@/application/errors/application-error";

class SafeProjectItemError extends ApplicationError {
  constructor(code: string, message: string) {
    super({ category: "NON_RETRYABLE", code, message, retryable: false });
  }
}

export class ProjectItemReconciliationConflictError extends SafeProjectItemError {
  constructor() {
    super(
      "PROJECT_ITEM_RECONCILIATION_CONFLICT",
      "Project items contain configuration that cannot be reconciled automatically",
    );
  }
}

export class ProjectItemNotFoundError extends SafeProjectItemError {
  constructor() {
    super("PROJECT_ITEM_NOT_FOUND", "The project item was not found");
  }
}

export class ProjectItemArchivedError extends SafeProjectItemError {
  constructor() {
    super("PROJECT_ITEM_ARCHIVED", "The archived project item is read-only");
  }
}

export class ProjectItemProductNotFoundError extends SafeProjectItemError {
  constructor() {
    super("PRODUCT_NOT_FOUND", "The affiliate product was not found");
  }
}

export class ProjectItemProductArchivedError extends SafeProjectItemError {
  constructor() {
    super("PRODUCT_ARCHIVED", "The archived affiliate product cannot be assigned");
  }
}

export class ProjectItemProductAccountMismatchError extends SafeProjectItemError {
  constructor() {
    super(
      "PRODUCT_ACCOUNT_MISMATCH",
      "The affiliate product is not compatible with the project account",
    );
  }
}

export class ProjectItemProductConflictError extends SafeProjectItemError {
  constructor() {
    super(
      "PRODUCT_ASSIGNMENT_CONFLICT",
      "The product assignment changed before the operation completed",
    );
  }
}

export class ProjectItemProductLimitError extends SafeProjectItemError {
  constructor() {
    super(
      "PRODUCT_ASSIGNMENT_LIMIT",
      "The bulk product assignment exceeds the supported item limit",
    );
  }
}
