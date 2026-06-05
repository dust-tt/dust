import type { ProjectKnowledgeFromConnectorItem } from "@app/lib/api/projects/context";
import type { ProjectWithAdminMetadata } from "@app/lib/api/projects/list";
import type { PodMetadataType } from "@app/types/project_metadata";
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

export type PokeProjectWorkflowInfo = {
  workflowId: string;
  runId: string;
  status: string;
  startTime: number | null;
  closeTime: number | null;
};

export type PokeGetProjectWorkflow = {
  metadata: PodMetadataType | null;
  temporalNamespace: string;
  workflowId: string;
  latestWorkflow: PokeProjectWorkflowInfo | null;
};
