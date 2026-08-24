import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE_NAME } from "@/infrastructure/auth/cookies";
import { getAuthenticationService } from "@/infrastructure/auth/runtime";

export default async function HomePage() {
  const cookieStore = await cookies();
  const session = await getAuthenticationService().authenticate(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );
  redirect(session === null ? "/login" : "/dashboard");
}
