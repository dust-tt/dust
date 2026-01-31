import type {
  ClientSideMCPServerConfigurationType,
  LightMCPToolConfigurationType,
  MCPServerConfigurationType,
} from "@app/lib/actions/mcp";
import type {
  AgentConfigurationType,
  AgentMessageType,
  AllSupportedFileContentType,
  ConversationType,
} from "@app/types";

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
