import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContext } from "@app/lib/actions/types";
import { runAgent } from "@app/lib/api/actions/servers/run_agent";
import {
  GENERIC_RUN_AGENT_TOOL_NAME,
  GENERIC_RUN_AGENT_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/run_agent/metadata";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { AGENT_DELEGATION_SERVER_NAME } from "./metadata";

async function createServer(
  auth: Authenticator,
  toolContext?: ToolContext
): Promise<McpServer> {
  const server = makeInternalMCPServer(AGENT_DELEGATION_SERVER_NAME);
  const [toolDefinition] = buildTools(GENERIC_RUN_AGENT_TOOLS_METADATA, {
    [GENERIC_RUN_AGENT_TOOL_NAME]: (
      {
        agentId,
        query,
        executionMode,
        toolsetsToAdd,
        fileOrContentFragmentIds,
        filePaths,
      },
      extra
    ) =>
      runAgent(
        {
          query,
          childAgentId: agentId,
          executionMode: executionMode.value,
          toolsetsToAdd,
          fileOrContentFragmentIds,
          filePaths,
        },
        {
          ...extra,
          auth,
          toolContext,
          toolName: GENERIC_RUN_AGENT_TOOL_NAME,
        }
      ),
  });

  registerTool(auth, toolContext, server, toolDefinition, {
    monitoringName: AGENT_DELEGATION_SERVER_NAME,
  });

  return server;
}

export default createServer;
