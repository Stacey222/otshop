import { ApplicationError } from "@/application/errors/application-error";

class SafeProductError extends ApplicationError {
  constructor(code: string, message: string) {
    super({ category: "NON_RETRYABLE", code, message, retryable: false });
  }
}

export class AffiliateProductNotFoundError extends SafeProductError {
  constructor() {
    super("AFFILIATE_PRODUCT_NOT_FOUND", "The affiliate product was not found");
  }
}
export class AffiliateProductArchivedError extends SafeProductError {
  constructor() {
    super("AFFILIATE_PRODUCT_ARCHIVED", "The archived affiliate product is read-only");
  }
}
export class AffiliateProductConflictError extends SafeProductError {
  constructor() {
    super(
      "AFFILIATE_PRODUCT_CONFLICT",
      "The affiliate product changed before the operation completed",
    );
  }
}
export class InvalidAffiliateProductReferenceError extends SafeProductError {
  constructor() {
    super(
      "INVALID_AFFILIATE_PRODUCT_REFERENCE",
      "The affiliate product reference is not available",
    );
  }
}
export class InvalidAffiliateProductPaginationError extends SafeProductError {
  constructor() {
    super(
      "INVALID_AFFILIATE_PRODUCT_PAGINATION",
      "The affiliate product pagination parameters are invalid",
    );
  }
}
export class AffiliateProductPersistenceFailureError extends ApplicationError {
  constructor() {
    super({
      category: "RETRYABLE",
      code: "AFFILIATE_PRODUCT_PERSISTENCE_FAILURE",
      message: "The affiliate product operation could not be completed safely",
      retryable: true,
    });
  }
}
