export class InvalidCredentialsError extends Error {
  override readonly name = "InvalidCredentialsError";
  constructor() {
    super("Invalid email or password");
  }
}

export class AuthenticationRequiredError extends Error {
  override readonly name = "AuthenticationRequiredError";
  constructor() {
    super("Authentication required");
  }
}

export class AuthorizationDeniedError extends Error {
  override readonly name = "AuthorizationDeniedError";
  constructor() {
    super("You are not authorized to perform this action");
  }
}

export class WorkspaceRequiredError extends Error {
  override readonly name = "WorkspaceRequiredError";
  constructor() {
    super("Select an active workspace");
  }
}
