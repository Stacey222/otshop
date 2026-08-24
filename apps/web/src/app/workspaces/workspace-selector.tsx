"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface WorkspaceOption {
  readonly id: string;
  readonly name: string;
  readonly organizationName: string;
  readonly role: string;
}

export function WorkspaceSelector({
  workspaces,
}: {
  readonly workspaces: readonly WorkspaceOption[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (workspaces.length === 0)
    return <p className="empty-state">No active workspace membership is available.</p>;
  return (
    <div className="workspace-list">
      {workspaces.map((workspace) => (
        <article className="workspace-card" key={workspace.id}>
          <div>
            <h2>{workspace.name}</h2>
            <p>
              {workspace.organizationName} · {workspace.role}
            </p>
          </div>
          <button
            type="button"
            disabled={pendingId !== null}
            onClick={async () => {
              setPendingId(workspace.id);
              setError(null);
              const response = await fetch("/api/workspaces/select", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workspaceId: workspace.id }),
              });
              if (!response.ok) {
                setError("Workspace selection was denied.");
                setPendingId(null);
                return;
              }
              router.replace("/dashboard");
              router.refresh();
            }}
          >
            {pendingId === workspace.id ? "Selecting…" : "Select"}
          </button>
        </article>
      ))}
      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
