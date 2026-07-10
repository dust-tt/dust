import type {
  ClientSideMCPServerConfigurationType,
  LightMCPToolConfigurationType,
  MCPServerConfigurationType,
} from "@app/lib/actions/mcp";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import type { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type {
  AgentConfigurationWithoutModelType,
  AgentModelConfigurationType,
} from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { AllSupportedFileContentType } from "@app/types/files";
import { z } from "zod";

const FileAuthorizationInfoSchema = z.object({
  fileId: z.string(),
  fileName: z.string(),
  connectionId: z.string(),
  mimeType: z.string(),
});

export type FileAuthorizationInfo = z.infer<typeof FileAuthorizationInfoSchema>;

export function isFileAuthorizationInfo(
  value: unknown
): value is FileAuthorizationInfo {
  return FileAuthorizationInfoSchema.safeParse(value).success;
}

const SandboxChildActionInfoSchema = z.object({
  parentActionId: z.string(),
});

export type SandboxChildActionInfo = z.infer<
  typeof SandboxChildActionInfoSchema
>;

export function isSandboxChildActionInfo(
  value: unknown
): value is SandboxChildActionInfo {
  return SandboxChildActionInfoSchema.safeParse(value).success;
}

const UserQuestionOptionSchema = z.object({
  label: z
    .string()
    .describe(
      "Concise choice text, 1-5 words. " +
        "Recommended option should include '(Recommended)'."
    ),
  description: z.string().nullable().describe("Explanation of this option."),
});

export const UserQuestionSchema = z.object({
  question: z
    .string()
    .describe("The question text. Should be clear and specific."),
  options: z
    .array(UserQuestionOptionSchema)
    .describe(
      "The available choices (typically 2 to 4 options, too many options to " +
        "choose from can be overwhelming for the user)."
    ),
  multiSelect: z
    .boolean()
    .describe(
      "Whether the user can select multiple options for this question."
    ),
});

export type UserQuestion = z.infer<typeof UserQuestionSchema>;

export const UserQuestionAnswerSchema = z.object({
  selectedOptions: z.array(z.number()),
  customResponse: z.string().optional(),
});

export type UserQuestionAnswer = z.infer<typeof UserQuestionAnswerSchema>;

const UserQuestionResumeStateSchema = z.object({
  type: z.literal("user_question"),
  question: UserQuestionSchema,
  answer: UserQuestionAnswerSchema.optional(),
});

export type UserQuestionResumeState = z.infer<
  typeof UserQuestionResumeStateSchema
>;

export function isUserQuestionResumeState(
  value: unknown
): value is UserQuestionResumeState {
  return UserQuestionResumeStateSchema.safeParse(value).success;
}

const SandboxResumeStateSchema = z.object({
  execId: z.string(),
});

export type SandboxResumeState = z.infer<typeof SandboxResumeStateSchema>;

export function isSandboxResumeState(
  value: unknown
): value is SandboxResumeState {
  return SandboxResumeStateSchema.safeParse(value).success;
}

export type StepContext = {
  citationsCount: number;
  citationsOffset: number;
  fileAuthorizationInfo?: FileAuthorizationInfo;
  sandboxChildActionInfo?: SandboxChildActionInfo;
  resumeState: Record<string, unknown> | null;
  retrievalTopK: number;
  websearchResultCount: number;
};

type ActionGeneratedFileBase = {
  title: string;
  snippet: string | null;
  hidden?: boolean;
  createdAt?: number;
  updatedAt?: number;
  isInProjectContext?: boolean;
  // True for files created by offloading oversized tool output to disk. These are never indexed in
  // Qdrant and should not be flagged as searchable in the conversation render.
  skipDataSourceIndexing?: boolean;
};

// File backed by a Dust FileResource: always a supported content type.
export type ActionGeneratedDBFileType = ActionGeneratedFileBase & {
  contentType: AllSupportedFileContentType;
  fileId: string;
  filePath?: never;
};

// File path only, no FileResource in DB. Not restricted to supported content types.
export type ActionGeneratedFilePathType = ActionGeneratedFileBase & {
  contentType: string;
  fileId: null;
  filePath: string;
};

export type ActionGeneratedFileType =
  | ActionGeneratedDBFileType
  | ActionGeneratedFilePathType;

export type AgentLoopRunContextType = {
  contextType: "agent_loop";
  action: AgentMCPActionResource;
  agentConfiguration: AgentConfigurationWithoutModelType;
  model: AgentModelConfigurationType & ModelConfigurationType;
  agentMessage: AgentMessageType;
  conversation: ConversationType;
  stepContext: StepContext;
  toolConfiguration: LightMCPToolConfigurationType;
  userMessage: UserMessageType;
};

export type SandboxFunctionRunContextType = {
  contextType: "sandbox_function";
  action: SandboxFunctionMCPActionResource;
  invocation: SandboxFunctionInvocationResource;
  toolConfiguration: LightMCPToolConfigurationType;
};

export type AgentLoopListToolsContextType = {
  agentConfiguration: AgentConfigurationWithoutModelType;
  agentActionConfiguration: MCPServerConfigurationType;
  clientSideActionConfigurations?: ClientSideMCPServerConfigurationType[];
  conversation: ConversationType;
  agentMessage: AgentMessageType;
};

export function isSandboxFunctionRunContext(
  value: AgentLoopRunContextType | SandboxFunctionRunContextType | undefined
): value is SandboxFunctionRunContextType {
  return value?.contextType === "sandbox_function";
}

export function isAgentLoopRunContext(
  value: AgentLoopRunContextType | SandboxFunctionRunContextType | undefined
): value is AgentLoopRunContextType {
  return value?.contextType === "agent_loop";
}

export type ToolContextType =
  | {
      runContext: AgentLoopRunContextType | SandboxFunctionRunContextType;
      listToolsContext?: never;
    }
  | {
      runContext?: never;
      listToolsContext: AgentLoopListToolsContextType;
    };
