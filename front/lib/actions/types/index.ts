import type {
  ClientSideMCPServerConfigurationType,
  LightMCPToolConfigurationType,
  MCPServerConfigurationType,
} from "@app/lib/actions/mcp";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationType,
} from "@app/types/assistant/conversation";
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
    .describe("The available choices (2 to 4 options)."),
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

// Carried by sandbox-spawned MCP actions (children of a bash tool exec).
// Lets `validateAction` recognize them and dispatch to the dedicated child
// workflow on approval, instead of relaunching the full agent loop (which
// would re-run the parent bash and clobber it).
const SandboxChildResumeStateSchema = z.object({
  type: z.literal("sandbox_child"),
  parentActionId: z.string(),
});

export type SandboxChildResumeState = z.infer<
  typeof SandboxChildResumeStateSchema
>;

export function isSandboxChildResumeState(
  value: unknown
): value is SandboxChildResumeState {
  return SandboxChildResumeStateSchema.safeParse(value).success;
}

export type StepContext = {
  citationsCount: number;
  citationsOffset: number;
  fileAuthorizationInfo?: FileAuthorizationInfo;
  resumeState: Record<string, unknown> | null;
  retrievalTopK: number;
  websearchResultCount: number;
};

type ActionGeneratedFileBase = {
  title: string;
  contentType: AllSupportedFileContentType;
  snippet: string | null;
  hidden?: boolean;
  createdAt?: number;
  updatedAt?: number;
  isInProjectContext?: boolean;
  // True for files created by offloading oversized tool output to disk. These are never indexed in
  // Qdrant and should not be flagged as searchable in the conversation render.
  skipDataSourceIndexing?: boolean;
};

// File backed by a Dust FileResource.
export type ActionGeneratedDBFileType = ActionGeneratedFileBase & {
  fileId: string;
  filePath?: never;
};

// File path only, no FileResource in DB.
export type ActionGeneratedFilePathType = ActionGeneratedFileBase & {
  fileId: null;
  filePath: string;
};

export type ActionGeneratedFileType =
  | ActionGeneratedDBFileType
  | ActionGeneratedFilePathType;

export type AgentLoopRunContextType = {
  agentConfiguration: AgentConfigurationType;
  agentMessage: AgentMessageType;
  clientSideActionConfigurations?: ClientSideMCPServerConfigurationType[];
  conversation: ConversationType;
  stepContext: StepContext;
  toolConfiguration: LightMCPToolConfigurationType;
  // sId of the AgentMCPAction this tool call is running under. Populated by
  // the agent loop's tool invocation path; tool handlers can read it instead
  // of querying for their own action by message id.
  actionId?: string;
};

export type AgentLoopListToolsContextType = {
  agentConfiguration: AgentConfigurationType;
  agentActionConfiguration: MCPServerConfigurationType;
  clientSideActionConfigurations?: ClientSideMCPServerConfigurationType[];
  conversation: ConversationType;
  agentMessage: AgentMessageType;
};

export type AgentLoopContextType =
  | {
      runContext: AgentLoopRunContextType;
      listToolsContext?: never;
    }
  | {
      runContext?: never;
      listToolsContext: AgentLoopListToolsContextType;
    };
