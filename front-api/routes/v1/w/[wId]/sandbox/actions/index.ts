import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { SANDBOX_TOOL_NAME } from "@app/lib/api/actions/servers/sandbox/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { resolveSkillMCPServers } from "@app/lib/api/assistant/skill_actions";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

import aId from "./[aId]";
import call from "./call";

interface GetSandboxToolsResponseType {
  serverViews: MCPServerViewType[];
}

// Mounted at /api/v1/w/:wId/sandbox/actions. sandboxAuth is applied by the
// parent sandbox sub-app, so ctx.get("auth") and ctx.get("sandboxClaims") are
// always available here.
const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.get("/", async (ctx): HandlerResult<GetSandboxToolsResponseType> => {
  const auth = ctx.get("auth");
  const { aId: agentId, cId } = ctx.get("sandboxClaims");

  // Fetch agent accessible servers.
  const agentConfig = await getAgentConfiguration(auth, {
    agentId,
    variant: "full",
  });
  if (!agentConfig) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: `Agent configuration ${agentId} not found.`,
      },
    });
  }

  const viewIds = new Set(
    agentConfig.actions
      .filter(isServerSideMCPServerConfiguration)
      .map((action) => action.mcpServerViewId)
  );

  // Fetch conversation-jitted servers.
  const conversationResult = await getConversation(auth, cId);
  if (conversationResult.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: `Conversation ${cId} not found.`,
      },
    });
  }

  const conversation = conversationResult.value;
  const attachments = await listAttachments(auth, { conversation });
  const { servers: jitServers } = await getJITServers(auth, {
    agentConfiguration: agentConfig,
    conversation,
    attachments,
  });
  const skillServers = await resolveSkillMCPServers(auth, {
    agentConfiguration: agentConfig,
    conversation,
  });
  for (const srv of jitServers) {
    viewIds.add(srv.mcpServerViewId);
  }
  for (const srv of skillServers) {
    if (isServerSideMCPServerConfiguration(srv)) {
      viewIds.add(srv.mcpServerViewId);
    }
  }

  if (viewIds.size === 0) {
    return ctx.json({ serverViews: [] }, 200);
  }

  // Fetch the server views with their tools metadata.
  const views = await MCPServerViewResource.fetchByIds(auth, [...viewIds]);

  const server = ctx.req.query("server");
  const light = ctx.req.query("light");

  let serverViews = views
    .map((view) => view.toJSON())
    .filter((sv) => sv.server.name !== SANDBOX_TOOL_NAME);

  // Filter by server name if requested.
  if (server !== undefined) {
    serverViews = serverViews.filter((sv) => sv.server.name === server);
  }

  // Strip tool inputSchemas in light mode.
  if (light === "true") {
    serverViews = serverViews.map((sv) => ({
      ...sv,
      server: {
        ...sv.server,
        tools: sv.server.tools.map(({ inputSchema, ...rest }) => rest),
      },
    }));
  }

  return ctx.json({ serverViews }, 200);
});

// `/call` (literal) must be registered before `/:aId` (param) so the param
// route does not swallow "call" as an action id.
app.route("/call", call);
app.route("/:aId", aId);

export default app;
