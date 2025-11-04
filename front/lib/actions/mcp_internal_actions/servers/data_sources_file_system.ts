import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerCatTool } from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/cat";
import {
  registerFindTool,
  registerFindToolWithDynamicTags,
} from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/find";
import {
  registerListTool,
  registerListToolWithDynamicTags,
} from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/list";
import {
  registerLocateTreeTool,
  registerLocateTreeToolWithDynamicTags,
} from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/locate_tree";
import {
  registerSearchTool,
  registerSearchToolWithDynamicTags,
} from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/search";
import { registerFindTagsTool } from "@app/lib/actions/mcp_internal_actions/tools/tags/find_tags";
import { shouldAutoGenerateTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("data_sources_file_system");

  const areTagsDynamic = agentLoopContext
    ? shouldAutoGenerateTags(agentLoopContext)
    : false;

  registerCatTool(auth, server, agentLoopContext); // tag filtering does not make sense for cat tool

  if (areTagsDynamic) {
    registerFindTagsTool(auth, server, agentLoopContext);

    registerListToolWithDynamicTags(auth, server, agentLoopContext);
    registerFindToolWithDynamicTags(auth, server, agentLoopContext);
    registerSearchToolWithDynamicTags(auth, server, agentLoopContext);
    registerLocateTreeToolWithDynamicTags(auth, server, agentLoopContext);
  } else {
    registerListTool(auth, server, agentLoopContext);
    registerFindTool(auth, server, agentLoopContext);
    registerSearchTool(auth, server, agentLoopContext);
    registerLocateTreeTool(auth, server, agentLoopContext);
  }

  return server;
}

export default createServer;
