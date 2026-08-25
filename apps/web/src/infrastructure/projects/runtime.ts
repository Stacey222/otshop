import "server-only";

import { ProjectRepository } from "@otshop/database";

import { ProjectService } from "@/application/projects/project-service";
import { logger } from "@/infrastructure/logging/logger";

let service: ProjectService | undefined;

export function getProjectService(): ProjectService {
  service ??= new ProjectService(new ProjectRepository(), logger);
  return service;
}
