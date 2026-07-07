import { shouldAutoGenerateTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContextType } from "@app/lib/actions/types";
import { DATA_SOURCE_SEARCH_DOCUMENT_TIME_FRAME_FEATURE_FLAG } from "@app/lib/api/actions/servers/data_sources_file_system/metadata";
import {
  TOOLS_WITH_DOCUMENT_TIME_FRAME,
  TOOLS_WITH_TAGS,
  TOOLS_WITH_TAGS_AND_DOCUMENT_TIME_FRAME,
  TOOLS_WITHOUT_TAGS,
} from "@app/lib/api/actions/servers/data_sources_file_system/tools";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

async function createServer(
  auth: Authenticator,
  toolContext?: ToolContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("data_sources_file_system");

  const areTagsDynamic = toolContext
    ? shouldAutoGenerateTags(toolContext)
    : false;
  const featureFlags = await getFeatureFlags(auth);
  const hasDocumentTimeFrameFeature = featureFlags.includes(
    DATA_SOURCE_SEARCH_DOCUMENT_TIME_FRAME_FEATURE_FLAG
  );

  const tools = areTagsDynamic
    ? hasDocumentTimeFrameFeature
      ? TOOLS_WITH_TAGS_AND_DOCUMENT_TIME_FRAME
      : TOOLS_WITH_TAGS
    : hasDocumentTimeFrameFeature
      ? TOOLS_WITH_DOCUMENT_TIME_FRAME
      : TOOLS_WITHOUT_TAGS;

  for (const tool of tools) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: tool.name,
    });
  }

  return server;
}

export default createServer;
