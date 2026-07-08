import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { SANDBOX_TOOL_NAME } from "@app/lib/api/actions/servers/sandbox/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { resolveSkillMCPServers } from "@app/lib/api/assistant/skill_actions";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  isSandboxExecTokenPayload,
  isSandboxFunctionInvocationTokenPayload,
} from "@app/lib/api/sandbox/access_tokens";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { sandboxApp } from "@front-api/middlewares/ctx";
import { sandboxAuth } from "@front-api/middlewares/sandbox_auth";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

import aId from "./[aId]";
import call from "./call";

interface GetSandboxToolsResponseType {
  serverViews: MCPServerViewType[];
}

// Mounted at /api/v1/w/:wId/sandbox/actions.
const app = sandboxApp();

// The dsbx CLI hits these same URLs from both conversation sandboxes (exec tokens) and
// sandbox function invocations; handlers branch on the claims kind.
app.use(
  "*",
  sandboxAuth({ allowedTokenKinds: ["action", "function_invocation"] })
);

// Response shaping shared by both token kinds: `?server=` name filtering and `?light=true`
// inputSchema stripping.
function filterServerViews(
  views: MCPServerViewType[],
  { server, light }: { server?: string; light?: string }
): MCPServerViewType[] {
  let serverViews = views.filter((sv) => sv.server.name !== SANDBOX_TOOL_NAME);

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

  return serverViews;
}

/**
 * @ignoreswagger
 * internal endpoint
 */
app.get("/", async (ctx): HandlerResult<GetSandboxToolsResponseType> => {
  const auth = ctx.get("auth");
  const claims = ctx.get("sandboxClaims");

  // Sandbox function invocations have no agent configuration or conversation: they see the
  // internal servers of their pod space (+ global space). Tools that require an agent-loop
  // context error at execution based on the run context.
  if (isSandboxFunctionInvocationTokenPayload(claims)) {
    // Deliberately not the EnsuringAutoViews variant: token read paths must not write. Auto
    // views not yet materialized in the global space stay invisible until another surface
    // hydrates them.
    const views = await MCPServerViewResource.listBySpaceIds(
      auth,
      [claims.spaceId],
      { includeGlobalSpace: true }
    );

    const serverViews = views
      .filter((view) => view.serverType === "internal")
      .map((view) => view.toJSON());

    return ctx.json(
      { serverViews: filterServerViews(serverViews, ctx.req.query()) },
      200
    );
  }

  if (!isSandboxExecTokenPayload(claims)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "This sandbox token cannot access sandbox actions.",
      },
    });
  }
  const { aId: agentId, cId } = claims;

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
  const jitServers = await getJITServers(auth, {
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

  return ctx.json(
    {
      serverViews: filterServerViews(
        views.map((view) => view.toJSON()),
        ctx.req.query()
      ),
    },
    200
  );
});

// `/call` (literal) must be registered before `/:aId` (param) so the param
// route does not swallow "call" as an action id.
app.route("/call", call);
app.route("/:aId", aId);

export default app;
