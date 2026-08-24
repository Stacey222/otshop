import { redirect } from "next/navigation";

import { getPageAuthentication } from "@/infrastructure/auth/page-context";
import { getAuthenticationService } from "@/infrastructure/auth/runtime";
import { PageErrorState } from "@/presentation/page-error-state";

import { WorkspaceSelector } from "../../workspaces/workspace-selector";

export const metadata = { title: "Workspaces · OTShop" };

export default async function WorkspacesPage() {
  const authentication = await getPageAuthentication();
  if (authentication.status === "unauthenticated") redirect("/login");
  if (authentication.status === "unavailable") {
    return <PageErrorState kind="service" requestId={authentication.requestId} />;
  }
  const { session } = authentication.value;
  let workspaces;
  try {
    workspaces = await getAuthenticationService().listWorkspaces(session);
  } catch {
    return <PageErrorState kind="service" requestId={authentication.value.request.requestId} />;
  }
  return (
    <section aria-labelledby="workspaces-title">
      <p className="eyebrow">Workspace context</p>
      <h1 id="workspaces-title">Select a workspace</h1>
      <p className="page-summary">
        Only active memberships are shown. Selection validates membership and rotates your session.
      </p>
      <WorkspaceSelector workspaces={workspaces} />
    </section>
  );
}
