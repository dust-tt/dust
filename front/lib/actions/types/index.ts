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

export type FileAuthorizationInfo = {
  fileId: string;
  fileName: string;
  connectionId: string;
  mimeType: string;
};

export function isFileAuthorizationInfo(
  value: unknown
): value is FileAuthorizationInfo {
  return (
    typeof value === "object" &&
    value !== null &&
    "fileId" in value &&
    typeof (value as Record<string, unknown>).fileId === "string" &&
    "fileName" in value &&
    typeof (value as Record<string, unknown>).fileName === "string" &&
    "connectionId" in value &&
    typeof (value as Record<string, unknown>).connectionId === "string" &&
    "mimeType" in value &&
    typeof (value as Record<string, unknown>).mimeType === "string"
  );
}

export type UserQuestionOption = {
  label: string;
  description: string;
  preview?: string;
};

export type UserQuestion = {
  question: string;
  header: string;
  options: UserQuestionOption[];
  multiSelect: boolean;
};

export type UserQuestionResumeState = {
  type: "user_question";
  questions: UserQuestion[];
  metadata?: Record<string, unknown>;
};

export function isUserQuestionResumeState(
  value: Record<string, unknown> | null
): value is UserQuestionResumeState {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "user_question" &&
    "questions" in value &&
    Array.isArray(value.questions)
  );
}

export type UserQuestionAnswerItem = {
  selectedOptions: number[];
  customResponse?: string;
};

export type UserQuestionAnswers = {
  answers: UserQuestionAnswerItem[];
};

export function isUserQuestionAnswers(
  value: unknown
): value is UserQuestionAnswers {
  return (
    typeof value === "object" &&
    value !== null &&
    "answers" in value &&
    Array.isArray((value as Record<string, unknown>).answers)
  );
}

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
  hidden?: boolean;
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
