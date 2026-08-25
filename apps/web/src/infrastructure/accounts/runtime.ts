import "server-only";

import { ShopeeAccountRepository } from "@otshop/database";

import { ShopeeAccountService } from "@/application/accounts/account-service";
import { logger } from "@/infrastructure/logging/logger";

let service: ShopeeAccountService | undefined;
export function getShopeeAccountService(): ShopeeAccountService {
  service ??= new ShopeeAccountService(new ShopeeAccountRepository(), logger);
  return service;
}
