import "server-only";

import { ProjectItemProductRepository, ProjectItemRepository } from "@otshop/database";

import { ProjectItemProductService } from "@/application/projects/project-item-product-service";
import { ProjectItemService } from "@/application/projects/project-item-service";
import { logger } from "@/infrastructure/logging/logger";

let service: ProjectItemService | undefined;
let productService: ProjectItemProductService | undefined;

export function getProjectItemService(): ProjectItemService {
  service ??= new ProjectItemService(new ProjectItemRepository(), logger);
  return service;
}

export function getProjectItemProductService(): ProjectItemProductService {
  productService ??= new ProjectItemProductService(new ProjectItemProductRepository(), logger);
  return productService;
}
