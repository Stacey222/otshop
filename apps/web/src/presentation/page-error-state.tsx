import Link from "next/link";

const copy = {
  permission: {
    title: "Permission denied",
    message: "Your current role cannot open this page.",
  },
  service: {
    title: "Service temporarily unavailable",
    message: "The control plane could not complete this request safely.",
  },
  workspace: {
    title: "Workspace unavailable",
    message: "Select an active workspace to continue.",
  },
} as const;

export function PageErrorState({
  kind,
  requestId,
}: {
  readonly kind: keyof typeof copy;
  readonly requestId: string;
}) {
  return (
    <section className="error-state" aria-labelledby="page-error-title">
      <p className="eyebrow">Request could not be completed</p>
      <h1 id="page-error-title">{copy[kind].title}</h1>
      <p>{copy[kind].message}</p>
      <p className="request-reference">
        Request ID: <code>{requestId}</code>
      </p>
      {kind === "workspace" ? <Link href="/workspaces">Choose workspace</Link> : null}
    </section>
  );
}
