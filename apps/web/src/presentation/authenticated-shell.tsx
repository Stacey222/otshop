import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "@/app/logout-button";

interface AuthenticatedShellProperties {
  readonly children: ReactNode;
  readonly user: { readonly displayName: string; readonly email: string };
  readonly workspace: {
    readonly name: string;
    readonly organizationName: string;
    readonly role: string;
  } | null;
}

const futureNavigation = ["Datasets", "Projects", "Jobs", "Accounts", "Devices", "Settings"];

export function AuthenticatedShell({ children, user, workspace }: AuthenticatedShellProperties) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <Link className="brand" href="/dashboard">
            OTShop
          </Link>
          <p>Control plane</p>
        </div>
        <div className="user-context">
          <div>
            <strong>{user.displayName}</strong>
            <span>{user.email}</span>
          </div>
          <LogoutButton />
        </div>
      </header>
      <aside className="app-sidebar">
        <nav aria-label="Primary navigation">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/workspaces">Workspaces</Link>
          {futureNavigation.map((label) => (
            <span aria-disabled="true" className="nav-unavailable" key={label}>
              {label} <small>Not available</small>
            </span>
          ))}
        </nav>
        <section className="workspace-context" aria-labelledby="workspace-context-title">
          <h2 id="workspace-context-title">Current workspace</h2>
          {workspace === null ? (
            <p>None selected</p>
          ) : (
            <>
              <strong>{workspace.name}</strong>
              <span>{workspace.organizationName}</span>
              <span className="role-badge">{workspace.role}</span>
            </>
          )}
        </section>
      </aside>
      <main className="app-content">{children}</main>
    </div>
  );
}
