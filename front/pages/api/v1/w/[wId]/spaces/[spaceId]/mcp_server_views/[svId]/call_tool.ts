import { FALLBACK_MCP_TOOL_STAKE_LEVEL } from "@app/lib/actions/constants";
import {
  callMCPToolForSandbox,
  makeServerSideMCPToolConfigurations,
} from "@app/lib/actions/mcp_actions";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { DEFAULT_MCP_TOOL_RETRY_POLICY } from "@app/lib/api/mcp";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import {
  type SandboxExecTokenPayload,
  verifySandboxExecToken,
} from "@app/lib/api/sandbox/access_tokens";
import { hasDsbxToolsEnabled } from "@app/lib/api/sandbox/feature_flags";
import { type Authenticator, isSandboxTokenPrefix } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { AgentMessageType } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { CallMCPToolResponseType } from "@dust-tt/client";
import { CallMCPToolRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

const DEFAULT_SANDBOX_STEP_CONTEXT = {
  citationsCount: 0,
  citationsOffset: 0,
  resumeState: null,
  retrievalTopK: 10,
  websearchResultCount: 10,
} as const;

async function extractSandboxClaims(
  req: NextApiRequest
): Promise<SandboxExecTokenPayload | null> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || !isSandboxTokenPrefix(token)) {
    return null;
  }
  return verifySandboxExecToken(token);
}

async function buildSandboxAgentLoopContext(
  auth: Authenticator,
  claims: SandboxExecTokenPayload,
  {
    toolName,
    view,
  }: {
    toolName: string;
    view: MCPServerViewResource;
  }
): Promise<AgentLoopContextType | undefined> {
  const mcpServerViewId = view.sId;
  const [agentConfiguration, conversationResult] = await Promise.all([
    getAgentConfiguration(auth, {
      agentId: claims.aId,
      variant: "full",
    }),
    getConversation(auth, claims.cId),
  ]);

  if (!agentConfiguration || conversationResult.isErr()) {
    return undefined;
  }

  const conversation = conversationResult.value;

  const agentMessage = conversation.content
    .flat()
    .find(
      (m): m is AgentMessageType =>
        m.type === "agent_message" && m.sId === claims.mId
    );

  if (!agentMessage) {
    return undefined;
  }

  // Find the matching server-side action config for this server view.
  // Search agent-configured actions first, then fall back to JIT servers
  // (tools added via the conversation input bar).
  let serverSideConfig = agentConfiguration.actions
    .filter(isServerSideMCPServerConfiguration)
    .find((a) => a.mcpServerViewId === mcpServerViewId);

  if (!serverSideConfig) {
    const { servers: jitServers } = await getJITServers(auth, {
      agentConfiguration,
      conversation,
      attachments: [],
    });
    serverSideConfig = jitServers.find(
      (s) => s.mcpServerViewId === mcpServerViewId
    );
  }

  if (!serverSideConfig) {
    return undefined;
  }

  const actualPermission =
    view.getToolPermission(toolName) ?? FALLBACK_MCP_TOOL_STAKE_LEVEL;

  const [fullToolConfiguration] = makeServerSideMCPToolConfigurations(
    serverSideConfig,
    [
      {
        name: toolName,
        description: "", // Not used — stripped before passing to runtime.
        availability: "manual",
        stakeLevel: actualPermission,
        toolServerId: view.mcpServerId,
        retryPolicy: DEFAULT_MCP_TOOL_RETRY_POLICY,
      },
    ]
  );

  if (!fullToolConfiguration) {
    return undefined;
  }

  // Strip inputSchema and description so the runtime object matches
  // LightServerSideMCPToolConfigurationType — the isLight type guard checks
  // !("inputSchema" in arg), so keeping these fields would break downstream
  // guards (e.g. isLightServerSideMCPToolConfiguration).
  const {
    inputSchema: _inputSchema,
    description: _description,
    ...toolConfiguration
  } = fullToolConfiguration;

  // Fetch the parent action's stepContext (the running sandbox bash tool).
  // There is at most one running sandbox action per agent message.
  const actions = await AgentMCPActionResource.listByAgentMessageIds(auth, [
    agentMessage.agentMessageId,
  ]);
  const parentAction = actions.find(
    (a) =>
      a.status === "running" && a.toolConfiguration.mcpServerName === "sandbox"
  );
  const stepContext = parentAction?.stepContext ?? DEFAULT_SANDBOX_STEP_CONTEXT;

  return {
    runContext: {
      agentConfiguration,
      agentMessage,
      conversation,
      stepContext,
      toolConfiguration,
    },
  };
}

/**
 * @ignoreswagger
 * internal endpoint
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<CallMCPToolResponseType>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (!(await hasDsbxToolsEnabled(auth))) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Sandbox dsbx tools are not enabled for this workspace.",
      },
    });
  }

  const { svId } = req.query;
  if (!isString(svId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid svId parameter.",
      },
    });
  }

  const view = await MCPServerViewResource.fetchById(auth, svId);
  if (!view) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "mcp_server_view_not_found",
        message: "MCP server view not found.",
      },
    });
  }

  if (view.space.sId !== space.sId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "mcp_server_view_not_found",
        message: "MCP server view not found in this space.",
      },
    });
  }

  const { method } = req;

  switch (method) {
    case "POST": {
      const bodyRes = CallMCPToolRequestBodySchema.safeParse(req.body);
      if (!bodyRes.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${bodyRes.error.message}`,
          },
        });
      }

      const { toolName, arguments: toolArgs } = bodyRes.data;

      const sandboxClaims = await extractSandboxClaims(req);
      if (!sandboxClaims) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_request_error",
            message: "Valid sandbox token required.",
          },
        });
      }

      const agentLoopContext = await buildSandboxAgentLoopContext(
        auth,
        sandboxClaims,
        { toolName, view }
      );

      const runContext = agentLoopContext?.runContext;
      if (!runContext) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_request_error",
            message:
              "Could not build agent loop context from sandbox token claims.",
          },
        });
      }

      const result = await callMCPToolForSandbox(auth, toolArgs, runContext);

      return res.status(200).json({
        success: true,
        result: {
          content: result.content,
          isError: result.isError === true,
        },
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Only POST is supported.",
        },
      });
  }
}

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
