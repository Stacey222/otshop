import "server-only";

import { AffiliateProductRepository } from "@otshop/database";

import { AffiliateProductService } from "@/application/products/affiliate-product-service";
import { logger } from "@/infrastructure/logging/logger";

let service: AffiliateProductService | undefined;
export function getAffiliateProductService(): AffiliateProductService {
  service ??= new AffiliateProductService(new AffiliateProductRepository(), logger);
  return service;
}
