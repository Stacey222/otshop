import "server-only";

import { AuthenticationRepository } from "@otshop/database";

import { AuthenticationService } from "@/application/auth/authentication-service";
import { Argon2idPasswordHasher } from "@/application/auth/password";
import { LocalLoginRateLimiter } from "@/application/auth/rate-limiter";

const globalAuth = globalThis as typeof globalThis & {
  otshopAuthenticationService?: AuthenticationService;
};

export function getAuthenticationService(): AuthenticationService {
  globalAuth.otshopAuthenticationService ??= new AuthenticationService(
    new AuthenticationRepository(),
    new Argon2idPasswordHasher(),
    new LocalLoginRateLimiter(),
  );
  return globalAuth.otshopAuthenticationService;
}
