import type {
  ClientSideMCPServerConfigurationType,
  MCPServerConfigurationType,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import type { ActionConfigurationType } from "@app/lib/actions/types/agent";
import type {
  AgentConfigurationType,
  AgentMessageType,
  AllSupportedFileContentType,
  ConversationType,
} from "@app/types";

export type ActionGeneratedFileType = {
  fileId: string;
  title: string;
  contentType: AllSupportedFileContentType;
  snippet: string | null;
};

export type AgentLoopRunContextType = {
  agentConfiguration: AgentConfigurationType;
  actionConfiguration: MCPToolConfigurationType;
  clientSideActionConfigurations?: ClientSideMCPServerConfigurationType[];
  conversation: ConversationType;
  agentMessage: AgentMessageType;
  stepActionIndex: number;
  stepActions: ActionConfigurationType[];
  citationsRefsOffset: number;
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
