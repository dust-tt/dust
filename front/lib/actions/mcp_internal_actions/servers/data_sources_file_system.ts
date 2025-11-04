import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  FILESYSTEM_CAT_TOOL_NAME,
  FILESYSTEM_FIND_TOOL_NAME,
  FILESYSTEM_LIST_TOOL_NAME,
  FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
  FIND_TAGS_TOOL_NAME,
  SEARCH_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { registerCatTool } from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/cat";
import { findCallback } from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/find";
import { registerListTool } from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/list";
import { locateTreeCallback } from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/locate_tree";
import { searchCallback } from "@app/lib/actions/mcp_internal_actions/tools/data_sources_file_system/search";
import { registerFindTagsTool } from "@app/lib/actions/mcp_internal_actions/tools/tags/find_tags";
import { shouldAutoGenerateTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import {
  DataSourceFilesystemFindInputSchema,
  DataSourceFilesystemLocateTreeInputSchema,
  SearchWithNodesInputSchema,
  TagsInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("data_sources_file_system");

  registerCatTool(auth, server, agentLoopContext, {
    name: FILESYSTEM_CAT_TOOL_NAME,
  });

  // Check if tags are dynamic before creating the search tool.
  const areTagsDynamic = agentLoopContext
    ? shouldAutoGenerateTags(agentLoopContext)
    : false;

  registerListTool(auth, server, agentLoopContext, {
    name: FILESYSTEM_LIST_TOOL_NAME,
    areTagsDynamic,
  });

  if (!areTagsDynamic) {
    server.tool(
      SEARCH_TOOL_NAME,
      "Perform a semantic search within the folders and files designated by `nodeIds`. All " +
        "children of the designated nodes will be searched.",
      SearchWithNodesInputSchema.shape,
      withToolLogging(
        auth,
        {
          toolNameForMonitoring: SEARCH_TOOL_NAME,
          agentLoopContext,
          enableAlerting: true,
        },
        async (params) => searchCallback(auth, agentLoopContext, params)
      )
    );

    server.tool(
      FILESYSTEM_FIND_TOOL_NAME,
      "Find content based on their title starting from a specific node. Can be used to find specific " +
        "nodes by searching for their titles. The query title can be omitted to list all nodes " +
        "starting from a specific node. This is like using 'find' in Unix.",
      DataSourceFilesystemFindInputSchema.shape,
      withToolLogging(
        auth,
        {
          toolNameForMonitoring: FILESYSTEM_FIND_TOOL_NAME,
          agentLoopContext,
          enableAlerting: true,
        },
        async (params) => findCallback(auth, params)
      )
    );

    server.tool(
      FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
      "Show the complete path from a node to the data source root, displaying the hierarchy of parent nodes. " +
        "This is useful for understanding where a specific node is located within the data source structure. " +
        "The path is returned as a list of nodes, with the first node being the data source root and " +
        "the last node being the target node.",
      DataSourceFilesystemLocateTreeInputSchema.shape,
      withToolLogging(
        auth,
        {
          toolNameForMonitoring: FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
          agentLoopContext,
          enableAlerting: true,
        },
        async (params) => locateTreeCallback(auth, params)
      )
    );
  } else {
    // If tags are dynamic, then we add a tool for the agent to discover tags and let it pass tags
    // in the search tool.
    registerFindTagsTool(auth, server, agentLoopContext, {
      name: FIND_TAGS_TOOL_NAME,
    });

    server.tool(
      SEARCH_TOOL_NAME,
      "Perform a semantic search within the folders and files designated by `nodeIds`. All " +
        "children of the designated nodes will be searched.",
      {
        ...SearchWithNodesInputSchema.shape,
        ...TagsInputSchema.shape,
      },
      withToolLogging(
        auth,
        {
          toolNameForMonitoring: SEARCH_TOOL_NAME,
          agentLoopContext,
          enableAlerting: true,
        },
        async (params) =>
          searchCallback(auth, agentLoopContext, params, {
            tagsIn: params.tagsIn,
            tagsNot: params.tagsNot,
          })
      )
    );

    server.tool(
      FILESYSTEM_FIND_TOOL_NAME,
      "Find content based on their title starting from a specific node. Can be used to find specific " +
        "nodes by searching for their titles. The query title can be omitted to list all nodes " +
        "starting from a specific node. This is like using 'find' in Unix.",
      {
        ...DataSourceFilesystemFindInputSchema.shape,
        ...TagsInputSchema.shape,
      },
      withToolLogging(
        auth,
        {
          toolNameForMonitoring: FILESYSTEM_FIND_TOOL_NAME,
          agentLoopContext,
          enableAlerting: true,
        },
        async (params) =>
          findCallback(auth, params, {
            tagsIn: params.tagsIn,
            tagsNot: params.tagsNot,
          })
      )
    );

    server.tool(
      FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
      "Show the complete path from a node to the data source root, displaying the hierarchy of parent nodes. " +
        "This is useful for understanding where a specific node is located within the data source structure. " +
        "The path is returned as a list of nodes, with the first node being the data source root and " +
        "the last node being the target node.",
      {
        ...DataSourceFilesystemLocateTreeInputSchema.shape,
        ...TagsInputSchema.shape,
      },
      withToolLogging(
        auth,
        {
          toolNameForMonitoring: FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
          agentLoopContext,
          enableAlerting: true,
        },
        async (params) =>
          locateTreeCallback(auth, params, {
            tagsIn: params.tagsIn,
            tagsNot: params.tagsNot,
          })
      )
    );
  }

  return server;
}

export default createServer;
