import { redirect } from "next/navigation";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import { getPageAuthentication, requirePagePermission } from "@/infrastructure/auth/page-context";
import { getPublisherService } from "@/infrastructure/publisher/runtime";
import { PageErrorState } from "@/presentation/page-error-state";
import { dashboardPageDecision } from "@/presentation/page-access";

const emptyStates = [
  ["Datasets", "Dataset information is not available in this slice."],
  ["Projects", "Project information is not available in this slice."],
  ["Jobs", "Job monitoring is not enabled."],
  ["Devices", "Device connectivity is not enabled."],
] as const;

export const metadata = { title: "Dashboard · OTShop" };

export default async function DashboardPage() {
  const authentication = await getPageAuthentication();
  const decision = dashboardPageDecision({
    authenticated: authentication.status === "authenticated",
    serviceAvailable: authentication.status !== "unavailable",
    workspaceValid:
      authentication.status === "authenticated" &&
      authentication.value.context !== null &&
      authentication.value.workspace !== null,
  });
  if (decision === "login") redirect("/login");
  if (decision === "workspaces") redirect("/workspaces");
  if (authentication.status === "unavailable") {
    return <PageErrorState kind="service" requestId={authentication.requestId} />;
  }
  if (authentication.status !== "authenticated") redirect("/login");
  const state = authentication.value;

  let authorizedContext;
  try {
    authorizedContext = await requirePagePermission(state, "workspace.read");
  } catch (error) {
    const denied =
      error instanceof AuthorizationDeniedError ||
      (error instanceof Error && error.name === "AuthorizationDeniedError");
    return (
      <PageErrorState
        kind={denied ? "permission" : "service"}
        requestId={state.request.requestId}
      />
    );
  }
  const publishers = getPublisherService().listPublishers(authorizedContext);
  const publisherLabels = {
    MOCK: "Mock Publisher",
    SHOPEE_ANDROID: "Shopee Android",
    SHOPEE_OFFICIAL_API: "Shopee Official API",
  } as const;

  return (
    <section aria-labelledby="dashboard-title">
      <p className="eyebrow">Authenticated workspace</p>
      <h1 id="dashboard-title">Dashboard</h1>
      <p className="page-summary">
        The application shell and authorization boundary are operational. Business modules remain
        intentionally unavailable.
      </p>
      <div className="empty-state-grid">
        {emptyStates.map(([title, message]) => (
          <article key={title}>
            <h2>{title}</h2>
            <p>{message}</p>
            <span>Not available yet</span>
          </article>
        ))}
      </div>
      <section className="publisher-status" aria-labelledby="publisher-status-title">
        <h2 id="publisher-status-title">Publisher availability</h2>
        <p>
          Registration does not enable real publishing. Only the local deterministic mock is
          operational.
        </p>
        <ul>
          {publishers.map((publisher) => (
            <li key={publisher.kind}>
              <span>{publisherLabels[publisher.kind]}</span>
              <strong className={publisher.available ? "available" : "unavailable"}>
                {publisher.available ? "Available" : "Unavailable"}
              </strong>
            </li>
          ))}
        </ul>
      </section>
      <section className="system-status" aria-labelledby="system-status-title">
        <h2 id="system-status-title">Application status</h2>
        <dl>
          <div>
            <dt>Web control plane</dt>
            <dd>Operational</dd>
          </div>
          <div>
            <dt>Workspace authorization</dt>
            <dd>Active</dd>
          </div>
          <div>
            <dt>Real publishing</dt>
            <dd>Disabled</dd>
          </div>
        </dl>
      </section>
    </section>
  );
}
