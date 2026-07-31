import type {
  ClientSideMCPServerConfigurationType,
  LightMCPToolConfigurationType,
  MCPServerConfigurationType,
} from "@app/lib/actions/mcp";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import type { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type { FileModel } from "@app/lib/resources/storage/models/files";
import type { AgentConfigurationWithoutModelType } from "@app/types/assistant/agent";
import type { StreamModelInfo } from "@app/types/assistant/agent_run";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { AllSupportedFileContentType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
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

type UserQuestionResumeState = z.infer<typeof UserQuestionResumeStateSchema>;

export function isUserQuestionResumeState(
  value: unknown
): value is UserQuestionResumeState {
  return UserQuestionResumeStateSchema.safeParse(value).success;
}

const SandboxResumeStateSchema = z.object({
  execId: z.string(),
});

type SandboxResumeState = z.infer<typeof SandboxResumeStateSchema>;

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

// A persisted tool output item in the generic shape returned by both AgentMCPActionResource and
// SandboxFunctionMCPActionResource createOutputItems: the stored content plus the file linkage
// required to render the model-facing view (hideFileFromActionOutput).
export type ToolOutputItemType = {
  content: CallToolResult["content"][number];
  fileId: ModelId | null;
  file: FileModel | null;
  workspaceId: ModelId;
};

export type AgentLoopRunContext = {
  contextType: "agent_loop";
  action: AgentMCPActionResource;
  agentConfiguration: AgentConfigurationWithoutModelType;
  modelInfo: StreamModelInfo;
  agentMessage: AgentMessageType;
  conversation: ConversationType;
  stepContext: StepContext;
  toolConfiguration: LightMCPToolConfigurationType;
  userMessage: UserMessageType;
};

export type SandboxFunctionRunContext = {
  contextType: "sandbox_function";
  action: SandboxFunctionMCPActionResource;
  invocation: SandboxFunctionInvocationResource;
  toolConfiguration: LightMCPToolConfigurationType;
};

export type AgentLoopListToolsContext = {
  agentConfiguration: AgentConfigurationWithoutModelType;
  agentActionConfiguration: MCPServerConfigurationType;
  clientSideActionConfigurations?: ClientSideMCPServerConfigurationType[];
  conversation: ConversationType;
  agentMessage: AgentMessageType;
  // Needed at listing time to know whether a person wrote the message this run
  // answers (see `isSystemAuthoredToolContext`).
  userMessage: UserMessageType;
};

// Context available to tool handlers at execution time: tools only ever run on a connection
// established with a run context, never on a listing-phase connection.
export type ToolRunContext = AgentLoopRunContext | SandboxFunctionRunContext;

export function isSandboxFunctionRunContext(
  value: ToolRunContext | undefined
): value is SandboxFunctionRunContext {
  return value?.contextType === "sandbox_function";
}

export function isAgentLoopRunContext(
  value: ToolRunContext | undefined
): value is AgentLoopRunContext {
  return value?.contextType === "agent_loop";
}

export type ToolContext =
  | {
      runContext: ToolRunContext;
      listToolsContext?: never;
    }
  | {
      runContext?: never;
      listToolsContext: AgentLoopListToolsContext;
    };

/**
 * Whether the message this run answers was posted by Dust rather than written
 * by a person: a user message with no author, which only server code can
 * produce (`postUserMessage`'s `doNotAssociateUser`). Today that is the
 * Activation Pod nudge and agent-posted Pod messages.
 *
 * Such a run must not reach for anyone's personal tool credentials: nobody
 * asked for it, so acting as them would be a surprise. Connections resolve to
 * the workspace connection instead, exactly as they would with no user at all,
 * and personal-only servers drop out of the tool list.
 */
export function isSystemAuthoredToolContext(
  toolContext: ToolContext | undefined
): boolean {
  if (toolContext?.listToolsContext) {
    return toolContext.listToolsContext.userMessage.user === null;
  }

  const { runContext } = toolContext ?? {};
  return (
    isAgentLoopRunContext(runContext) && runContext.userMessage.user === null
  );
}
