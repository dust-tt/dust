import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { default as askAgentServer } from "@app/lib/actions/mcp_internal_actions/servers/ask_agent";
import { default as dataSourceUtilsServer } from "@app/lib/actions/mcp_internal_actions/servers/data_source_utils";
import { default as githubServer } from "@app/lib/actions/mcp_internal_actions/servers/github";
import { default as helloWorldServer } from "@app/lib/actions/mcp_internal_actions/servers/helloworld";
import { default as imageGenerationDallEServer } from "@app/lib/actions/mcp_internal_actions/servers/image_generation_dalle";
import { default as tableUtilsServer } from "@app/lib/actions/mcp_internal_actions/servers/table_utils";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationType } from "@app/types";
import { assertNever } from "@app/types";

export function getInternalMCPServer(
  auth: Authenticator,
  {
    internalMCPServerName,
    mcpServerId,
    conversation,
  }: {
    internalMCPServerName: InternalMCPServerNameType;
    mcpServerId: string;
    conversation?: ConversationType;
  }
): McpServer {
  switch (internalMCPServerName) {
    case "helloworld":
      return helloWorldServer(auth, mcpServerId);
    case "data-source-utils":
      return dataSourceUtilsServer();
    case "table-utils":
      return tableUtilsServer();
    case "github":
      return githubServer(auth, mcpServerId);
    case "image-generation-dalle":
      return imageGenerationDallEServer(auth);
    case "ask-agent":
      return askAgentServer(auth, conversation);
    default:
      assertNever(internalMCPServerName);
  }
}
