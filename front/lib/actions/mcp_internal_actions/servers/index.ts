import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { default as agentHandoffServer } from "@app/lib/actions/mcp_internal_actions/servers/agent_handoff";
import { default as askAgentServer } from "@app/lib/actions/mcp_internal_actions/servers/ask_agent";
import { default as dataSourceUtilsServer } from "@app/lib/actions/mcp_internal_actions/servers/data_source_utils";
import { default as githubServer } from "@app/lib/actions/mcp_internal_actions/servers/github";
import { default as helloWorldServer } from "@app/lib/actions/mcp_internal_actions/servers/helloworld";
import { default as imageGenerationDallEServer } from "@app/lib/actions/mcp_internal_actions/servers/image_generation_dalle";
import { default as tableUtilsServer } from "@app/lib/actions/mcp_internal_actions/servers/table_utils";
import type { Authenticator } from "@app/lib/auth";
import type {
  AgentConfigurationType,
  ConversationType,
  UserMessageType,
} from "@app/types";
import { assertNever } from "@app/types";

export function getInternalMCPServer(
  auth: Authenticator,
  {
    internalMCPServerName,
    mcpServerId,
    conversation,
    getAgentConfiguration,
    userMessage,
  }: {
    internalMCPServerName: InternalMCPServerNameType;
    mcpServerId: string;
    conversation?: ConversationType;
    getAgentConfiguration?: (
      auth: Authenticator,
      agentId: string
    ) => Promise<AgentConfigurationType | null>;
    userMessage?: UserMessageType;
  }
): McpServer {
  switch (internalMCPServerName) {
    case "hello_world":
      return helloWorldServer(auth, mcpServerId);
    case "data_source_utils":
      return dataSourceUtilsServer();
    case "table_utils":
      return tableUtilsServer();
    case "github":
      return githubServer(auth, mcpServerId);
    case "image_generation_dalle":
      return imageGenerationDallEServer(auth);
    case "ask_agent":
      return askAgentServer(auth, userMessage, getAgentConfiguration);
    case "agent_handoff":
      return agentHandoffServer(auth, conversation, getAgentConfiguration);
    default:
      assertNever(internalMCPServerName);
  }
}
