import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE_NAME } from "@/infrastructure/auth/cookies";
import { getAuthenticationService } from "@/infrastructure/auth/runtime";

import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const session = await getAuthenticationService().authenticate(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );
  if (session !== null) redirect("/dashboard");
  return (
    <main>
      <section className="panel auth-panel" aria-labelledby="login-title">
        <p className="eyebrow">OTShop · Secure control plane</p>
        <h1 id="login-title">Sign in</h1>
        <p className="summary">
          Use your OTShop application account. Shopee credentials are never accepted here.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
