import argon2 from "argon2";

export interface PasswordVerification {
  readonly valid: boolean;
  readonly needsUpgrade: boolean;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<PasswordVerification>;
  verifyUnknown(password: string): Promise<void>;
}

export const argon2idOptions = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
});

const rehashOptions = {
  memoryCost: argon2idOptions.memoryCost,
  timeCost: argon2idOptions.timeCost,
  parallelism: argon2idOptions.parallelism,
};

export class Argon2idPasswordHasher implements PasswordHasher {
  private readonly dummyHash = argon2.hash("OTShop timing-only non-credential", argon2idOptions);

  hash(password: string): Promise<string> {
    return argon2.hash(password, argon2idOptions);
  }

  async verify(passwordHash: string, password: string): Promise<PasswordVerification> {
    try {
      const valid = await argon2.verify(passwordHash, password);
      return {
        valid,
        needsUpgrade: valid && argon2.needsRehash(passwordHash, rehashOptions),
      };
    } catch {
      return { valid: false, needsUpgrade: false };
    }
  }

  async verifyUnknown(password: string): Promise<void> {
    await argon2.verify(await this.dummyHash, password);
  }
}
