import type { ProjectKnowledgeFromConnectorItem } from "@app/lib/api/projects/context";
import type { ProjectWithAdminMetadata } from "@app/lib/api/projects/list";
import type {
  SandboxFunctionExecutionMode,
  SandboxFunctionStake,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import type { PodTaskType } from "@app/types/project_task";
import type { JSONSchema7 as JSONSchema } from "json-schema";

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

export type PokePodFunction = {
  sId: string;
  slug: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  author: string | null;
};

export type PokeListProjectPodFunctions = {
  items: PokePodFunction[];
};

export type PokePodFunctionDetails = PokePodFunction & {
  fileId: string;
  userIdentity: SandboxFunctionUserIdentityPolicy | null;
  executionMode: SandboxFunctionExecutionMode;
  defaultStake: SandboxFunctionStake;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
};

export type PokeGetPodFunction = {
  podFunction: PokePodFunctionDetails;
};

export type PokeGetPodFunctionSource = {
  source: string;
};
