import type {
  ClientSideMCPServerConfigurationType,
  MCPServerConfigurationType,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import type { ActionConfigurationType } from "@app/lib/actions/types/agent";
import type { StepContext } from "@app/lib/actions/utils";
import type { Authenticator } from "@app/lib/auth";
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
  stepContext: StepContext;
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
