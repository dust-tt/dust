import type { ProjectKnowledgeFromConnectorItem } from "@app/lib/api/projects/context";
import type { ProjectWithAdminMetadata } from "@app/lib/api/projects/list";
import type { PodTaskType } from "@app/types/project_task";

export type PokeProjectType = ProjectWithAdminMetadata;

export type PokeListProjects = {
  projects: PokeProjectType[];
};

export type PokeProjectKnowledgeFromConnectorItem =
  ProjectKnowledgeFromConnectorItem;

export type PokeListProjectKnowledgeFromConnectors = {
  items: PokeProjectKnowledgeFromConnectorItem[];
};

export type PokeListProjectTasks = {
  tasks: PodTaskType[];
};

export type PokePodDatabase = {
  name: string;
  sizeBytes: number;
};

export type PokeListProjectPodDatabases = {
  items: PokePodDatabase[];
};
