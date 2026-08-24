import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getAppConfig } from "@otshop/config";

import { getPageAuthentication } from "@/infrastructure/auth/page-context";
import { AuthenticatedShell } from "@/presentation/authenticated-shell";
import { PageErrorState } from "@/presentation/page-error-state";

export default async function AuthenticatedLayout({ children }: { readonly children: ReactNode }) {
  const authentication = await getPageAuthentication();
  if (authentication.status === "unauthenticated") redirect("/login");
  if (authentication.status === "unavailable") {
    return (
      <main className="standalone-error">
        <PageErrorState kind="service" requestId={authentication.requestId} />
      </main>
    );
  }

  const { session, workspace } = authentication.value;
  const features = getAppConfig().features;
  const publishingAvailable =
    features.realPublishEnabled &&
    (features.shopeeAndroidEnabled || features.shopeeOfficialApiEnabled);

  return (
    <AuthenticatedShell
      user={{ displayName: session.displayName, email: session.email }}
      workspace={
        workspace === null
          ? null
          : {
              name: workspace.name,
              organizationName: workspace.organizationName,
              role: workspace.role,
            }
      }
    >
      {publishingAvailable ? null : (
        <p className="feature-notice" role="status">
          Real publishing integrations are disabled.
        </p>
      )}
      {children}
    </AuthenticatedShell>
  );
}
