import { ApplicationError } from "@/application/errors/application-error";

class SafeAccountError extends ApplicationError {
  constructor(code: string, message: string) {
    super({ category: "NON_RETRYABLE", code, message, retryable: false });
  }
}

export class ShopeeAccountNotFoundError extends SafeAccountError {
  constructor() {
    super("SHOPEE_ACCOUNT_NOT_FOUND", "The Shopee account was not found");
  }
}
export class ShopeeAccountArchivedError extends SafeAccountError {
  constructor() {
    super("SHOPEE_ACCOUNT_ARCHIVED", "The archived Shopee account is read-only");
  }
}
export class ShopeeAccountConflictError extends SafeAccountError {
  constructor() {
    super("SHOPEE_ACCOUNT_CONFLICT", "The Shopee account changed before the operation completed");
  }
}
export class InvalidAccountPaginationError extends SafeAccountError {
  constructor() {
    super("INVALID_ACCOUNT_PAGINATION", "The account pagination parameters are invalid");
  }
}
export class ShopeeAccountPersistenceFailureError extends ApplicationError {
  constructor() {
    super({
      category: "RETRYABLE",
      code: "SHOPEE_ACCOUNT_PERSISTENCE_FAILURE",
      message: "The account operation could not be completed safely",
      retryable: true,
    });
  }
}
