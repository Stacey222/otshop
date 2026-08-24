export interface ConfigurationIssue {
  readonly message: string;
  readonly path: string;
}

export class ConfigurationError extends Error {
  override readonly name = "ConfigurationError";

  constructor(readonly issues: ReadonlyArray<ConfigurationIssue>) {
    super("Application configuration is invalid");
  }
}
