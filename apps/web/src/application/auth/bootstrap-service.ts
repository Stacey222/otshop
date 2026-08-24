import { AuthenticationRepository } from "@otshop/database";
import { LoginRequestSchema, RequestIdSchema, UserIdSchema, createUuidV7 } from "@otshop/shared";
import { z } from "zod";

import type { PasswordHasher } from "./password";

export const BootstrapInputSchema = z
  .object({
    email: LoginRequestSchema.shape.email,
    displayName: z.string().trim().min(1).max(200),
    password: z
      .string()
      .min(12)
      .max(1_024)
      .regex(/[a-z]/u)
      .regex(/[A-Z]/u)
      .regex(/[0-9]/u)
      .regex(/[^A-Za-z0-9]/u),
  })
  .strict();

export type BootstrapInput = Readonly<z.infer<typeof BootstrapInputSchema>>;

export class SuperAdminBootstrapService {
  constructor(
    private readonly repository: AuthenticationRepository,
    private readonly passwords: PasswordHasher,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async bootstrap(rawInput: unknown): Promise<{ readonly userId: string }> {
    const input = BootstrapInputSchema.parse(rawInput);
    const now = this.clock();
    const userId = UserIdSchema.parse(createUuidV7(now.getTime()));
    const requestId = RequestIdSchema.parse(createUuidV7(now.getTime()));
    const passwordHash = await this.passwords.hash(input.password);

    await this.repository.bootstrapSuperAdmin({
      userId,
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      now,
      audit: {
        id: createUuidV7(now.getTime()),
        action: "SUPER_ADMIN_BOOTSTRAPPED",
        actorId: userId,
        actorType: "SYSTEM",
        requestId,
        resourceId: userId,
        resourceType: "USER",
        afterData: { role: "SUPER_ADMIN" },
      },
    });
    return { userId };
  }
}
