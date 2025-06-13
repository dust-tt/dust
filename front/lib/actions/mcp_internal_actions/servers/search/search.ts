import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import {
  findTagsSchema,
  makeFindTagsDescription,
  makeFindTagsTool,
} from "@app/lib/actions/mcp_internal_actions/servers/common/find_tags_tool";
import { searchFunction } from "@app/lib/actions/mcp_internal_actions/servers/search/utils";
import { shouldAutoGenerateTags } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "search",
  version: "1.0.0",
  description: "Search through selected Data sources (mcp)",
  icon: "ActionMagnifyingGlassIcon",
  authorization: null,
  documentationUrl: null,
};

const SEARCH_TOOL_NAME = "semantic_search";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = new McpServer(serverInfo);

  const commonInputsSchema = {
    query: z
      .string()
      .describe(
        "The string used to retrieve relevant chunks of information using semantic similarity" +
          " based on the user request and conversation context." +
          " Include as much semantic signal based on the entire conversation history," +
          " paraphrasing if necessary. longer queries are generally better."
      ),
    relativeTimeFrame: z
      .string()
      .regex(/^(all|\d+[hdwmy])$/)
      .describe(
        "The time frame (relative to LOCAL_TIME) to restrict the search based" +
          " on the user request and past conversation context." +
          " Possible values are: `all`, `{k}h`, `{k}d`, `{k}w`, `{k}m`, `{k}y`" +
          " where {k} is a number. Be strict, do not invent invalid values."
      ),
    dataSources:
      ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
  };

  const tagsInputSchema = {
    tagsIn: z
      .array(z.string())
      .describe(
        "A list of labels (also called tags) to restrict the search based on the user request and past conversation context." +
          "If multiple labels are provided, the search will return documents that have at least one of the labels." +
          "You can't check that all labels are present, only that at least one is present." +
          "If no labels are provided, the search will return all documents regardless of their labels."
      ),
    tagsNot: z
      .array(z.string())
      .describe(
        "A list of labels (also called tags) to exclude from the search based on the user request and past conversation context." +
          "Any document having one of these labels will be excluded from the search."
      ),
  };

  const areTagsDynamic = agentLoopContext
    ? shouldAutoGenerateTags(agentLoopContext)
    : false;

  if (!areTagsDynamic) {
    server.tool(
      SEARCH_TOOL_NAME,
      "Search the data sources specified by the user." +
        " The search is based on semantic similarity between the query and chunks of information" +
        " from the data sources.",
      commonInputsSchema,
      withToolLogging(auth, SEARCH_TOOL_NAME, async (args) =>
        searchFunction({ ...args, auth, agentLoopContext })
      )
    );
  } else {
    server.tool(
      SEARCH_TOOL_NAME,
      "Search the data sources specified by the user." +
        " The search is based on semantic similarity between the query and chunks of information" +
        " from the data sources.",
      {
        ...commonInputsSchema,
        ...tagsInputSchema,
      },
      withToolLogging(auth, SEARCH_TOOL_NAME, async (args) =>
        searchFunction({ ...args, auth, agentLoopContext })
      )
    );

    server.tool(
      "find_tags",
      makeFindTagsDescription(SEARCH_TOOL_NAME),
      findTagsSchema,
      makeFindTagsTool(auth)
    );
  }

  return server;
}

export default createServer;
