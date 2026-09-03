import type { ProjectKnowledgeFromConnectorItem } from "@app/lib/api/projects/context";
import type { ProjectWithAdminMetadata } from "@app/lib/api/projects/list";
import type { StoredSandboxFunctionCallError } from "@app/lib/resources/sandbox_function_invocation_resource";
import type {
  SandboxFunctionExecutionMode,
  SandboxFunctionInvocationOrigin,
  SandboxFunctionInvocationStatus,
  SandboxFunctionMCPActionType,
  SandboxFunctionStake,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import type { PodTaskType } from "@app/types/project_task";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
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

export type PokeProjectDatabase = {
  name: string;
  sizeBytes: number;
};

export type PokeListProjectDatabases = {
  items: PokeProjectDatabase[];
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

export type PokePodFunctionInvocation = {
  sId: string;
  status: SandboxFunctionInvocationStatus;
  origin: SandboxFunctionInvocationOrigin | null;
  user: string | null;
  createdAt: string;
  updatedAt: string;
  mcpActionCount: number;
};

export type PokeListPodFunctionInvocations = {
  items: PokePodFunctionInvocation[];
};

export type PokePodFunctionMCPAction = SandboxFunctionMCPActionType & {
  mcpServerViewId: string | null;
  mcpServerName: string | null;
  hasOutput: boolean;
};

export type PokePodFunctionInvocationDetails = PokePodFunctionInvocation & {
  input: unknown;
  result: unknown;
  error: StoredSandboxFunctionCallError | null;
  mcpActions: PokePodFunctionMCPAction[];
};

export type PokeGetPodFunctionInvocation = {
  invocation: PokePodFunctionInvocationDetails;
};

export type PokeGetPodFunctionMCPActionOutput = {
  output: CallToolResult["content"] | null;
  // Machine-readable payload of the tool result, when the tool provided one.
  structuredContent?: CallToolResult["structuredContent"];
};
