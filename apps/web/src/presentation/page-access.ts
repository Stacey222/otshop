export type ProtectedPageDecision = "allow" | "login" | "service-unavailable" | "workspaces";

export function dashboardPageDecision(input: {
  readonly authenticated: boolean;
  readonly serviceAvailable: boolean;
  readonly workspaceValid: boolean;
}): ProtectedPageDecision {
  if (!input.serviceAvailable) return "service-unavailable";
  if (!input.authenticated) return "login";
  return input.workspaceValid ? "allow" : "workspaces";
}
