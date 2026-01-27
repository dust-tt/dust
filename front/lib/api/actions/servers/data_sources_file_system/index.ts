import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { shouldAutoGenerateTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  FILESYSTEM_CAT_TOOL_NAME,
  FILESYSTEM_FIND_TOOL_NAME,
  FILESYSTEM_LIST_TOOL_NAME,
  FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
  FILESYSTEM_SEARCH_TOOL_NAME,
  FIND_TAGS_TOOL_NAME,
} from "@app/lib/api/actions/servers/data_sources_file_system/metadata";
import { registerCatTool } from "@app/lib/api/actions/servers/data_sources_file_system/tools/cat";
import { registerFindTool } from "@app/lib/api/actions/servers/data_sources_file_system/tools/find";
import { registerListTool } from "@app/lib/api/actions/servers/data_sources_file_system/tools/list";
import { registerLocateTreeTool } from "@app/lib/api/actions/servers/data_sources_file_system/tools/locate_tree";
import { registerSearchTool } from "@app/lib/api/actions/servers/data_sources_file_system/tools/search";
import { registerFindTagsTool } from "@app/lib/api/actions/tools/find_tags";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("data_sources_file_system");

  const areTagsDynamic = agentLoopContext
    ? shouldAutoGenerateTags(agentLoopContext)
    : false;

  // Register all filesystem tools.
  registerCatTool(auth, server, agentLoopContext, {
    name: FILESYSTEM_CAT_TOOL_NAME,
  });

  registerListTool(auth, server, agentLoopContext, {
    name: FILESYSTEM_LIST_TOOL_NAME,
  });

  registerSearchTool(auth, server, agentLoopContext, {
    name: FILESYSTEM_SEARCH_TOOL_NAME,
    areTagsDynamic,
  });

  registerFindTool(auth, server, agentLoopContext, {
    name: FILESYSTEM_FIND_TOOL_NAME,
    areTagsDynamic,
  });

  registerLocateTreeTool(auth, server, agentLoopContext, {
    name: FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
  });

  // If tags are dynamic, register the find tags tool to help agents discover tags.
  if (areTagsDynamic) {
    registerFindTagsTool(auth, server, agentLoopContext, {
      name: FIND_TAGS_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
