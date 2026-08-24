import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthenticatedShell } from "./authenticated-shell";
import { dashboardPageDecision } from "./page-access";
import { PageErrorState } from "./page-error-state";

describe("authenticated application shell", () => {
  it("renders safe user/workspace context and honest unavailable navigation", () => {
    const html = renderToStaticMarkup(
      <AuthenticatedShell
        user={{ displayName: "Ada Operator", email: "ada@example.test" }}
        workspace={{ name: "Operations", organizationName: "Example Org", role: "VIEWER" }}
      >
        <p>Page content</p>
      </AuthenticatedShell>,
    );
    expect(html).toContain("Ada Operator");
    expect(html).toContain("Operations");
    expect(html).toContain("VIEWER");
    expect(html).toContain("Not available");
    expect(html).not.toContain("session token");
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/u);
  });

  it("fails closed for unauthenticated and invalid workspace states", () => {
    expect(
      dashboardPageDecision({
        authenticated: false,
        serviceAvailable: true,
        workspaceValid: false,
      }),
    ).toBe("login");
    expect(
      dashboardPageDecision({
        authenticated: true,
        serviceAvailable: true,
        workspaceValid: false,
      }),
    ).toBe("workspaces");
  });

  it("renders a safe support reference without internal diagnostics", () => {
    const html = renderToStaticMarkup(
      <PageErrorState kind="service" requestId="018f0000-0000-7000-8000-000000000000" />,
    );
    expect(html).toContain("Service temporarily unavailable");
    expect(html).toContain("Request ID:");
    expect(html).not.toContain("stack");
  });
});
