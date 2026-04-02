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
  label: z.string(),
  description: z.string().nullable(),
});

export const UserQuestionSchema = z.object({
  question: z.string(),
  options: z.array(UserQuestionOptionSchema),
  multiSelect: z.boolean(),
});

export type UserQuestion = z.infer<typeof UserQuestionSchema>;

export type StepContext = {
  citationsCount: number;
  citationsOffset: number;
  fileAuthorizationInfo?: FileAuthorizationInfo;
  resumeState: Record<string, unknown> | null;
  retrievalTopK: number;
  websearchResultCount: number;
};

export type ActionGeneratedFileType = {
  fileId: string;
  title: string;
  contentType: AllSupportedFileContentType;
  snippet: string | null;
  createdAt?: number;
  updatedAt?: number;
  isInProjectContext?: boolean;
};

export type AgentLoopRunContextType = {
  agentConfiguration: AgentConfigurationType;
  agentMessage: AgentMessageType;
  clientSideActionConfigurations?: ClientSideMCPServerConfigurationType[];
  conversation: ConversationType;
  stepContext: StepContext;
  toolConfiguration: LightMCPToolConfigurationType;
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
