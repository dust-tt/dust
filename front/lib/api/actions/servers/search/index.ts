import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { shouldAutoGenerateTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import {
  SearchInputSchema,
  TagsInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  SEARCH_SERVER,
  SEARCH_SERVER_NAME,
  SEARCH_TOOL_DESCRIPTION,
  SEARCH_TOOL_NAME,
} from "@app/lib/api/actions/servers/search/metadata";
import { searchFunction } from "@app/lib/api/actions/servers/search/tools";
import { registerFindTagsTool } from "@app/lib/api/actions/tools/find_tags";
import { FIND_TAGS_TOOL_NAME } from "@app/lib/api/actions/tools/find_tags/metadata";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(SEARCH_SERVER_NAME);

  const areTagsDynamic = agentLoopContext
    ? shouldAutoGenerateTags(agentLoopContext)
    : false;

  if (!areTagsDynamic) {
    server.tool(
      SEARCH_TOOL_NAME,
      SEARCH_TOOL_DESCRIPTION,
      SearchInputSchema.shape,
      withToolLogging(
        auth,
        {
          toolNameForMonitoring: SEARCH_TOOL_NAME,
          agentLoopContext,
          enableAlerting: true,
        },
        async (args) => searchFunction({ ...args, auth, agentLoopContext })
      )
    );
  } else {
    server.tool(
      SEARCH_TOOL_NAME,
      SEARCH_TOOL_DESCRIPTION,
      {
        ...SearchInputSchema.shape,
        ...TagsInputSchema.shape,
      },
      withToolLogging(
        auth,
        {
          toolNameForMonitoring: SEARCH_TOOL_NAME,
          agentLoopContext,
          enableAlerting: true,
        },
        async (args) => searchFunction({ ...args, auth, agentLoopContext })
      )
    );

    registerFindTagsTool(auth, server, agentLoopContext, {
      name: FIND_TAGS_TOOL_NAME,
      extraDescription: `This tool is meant to be used before the ${SEARCH_TOOL_NAME} tool.`,
    });
  }

  return server;
}

export { SEARCH_SERVER };

export default createServer;
