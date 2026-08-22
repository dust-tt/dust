import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import type { ToolContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { POD_APP_TOOLSET_SERVER_NAME } from "@app/lib/api/actions/servers/pod_app_toolset/metadata";
import {
  callPodAppTool,
  listPodAppTools,
} from "@app/lib/api/actions/servers/pod_app_toolset/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";

/**
 * One instance of this server per shared pod app: the instance's sId is bound to a PodAppShare
 * row, and every published function of the shared app becomes one tool.
 *
 * Tools serve their function's stored JSON Schema verbatim, which the zod-based `registerTool`
 * wrapper cannot express — so this server installs its own low-level list/call handlers. Never
 * call `registerTool` on it: the SDK forbids mixing the two, and `_meta.dust` is emitted by the
 * listing handler instead.
 */
function createServer(
  auth: Authenticator,
  mcpServerId: string,
  toolContext?: ToolContext
): McpServer {
  const server = makeInternalMCPServer(POD_APP_TOOLSET_SERVER_NAME);

  server.server.registerCapabilities({ tools: { listChanged: true } });

  server.server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: await listPodAppTools(auth, mcpServerId) };
  });

  server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const runContext = toolContext?.runContext;
    assert(runContext, "Tool handlers require a tool run context.");
    const timezone = isAgentLoopRunContext(runContext)
      ? runContext.userMessage.context.timezone
      : runContext.invocation.context?.timezone;
    return callPodAppTool(
      auth,
      mcpServerId,
      request.params.name,
      request.params.arguments ?? {},
      timezone === undefined ? undefined : { timezone }
    );
  });

  return server;
}

export default createServer;
