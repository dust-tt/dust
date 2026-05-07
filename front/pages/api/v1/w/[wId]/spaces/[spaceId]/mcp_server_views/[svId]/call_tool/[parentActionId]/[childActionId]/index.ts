import { isSandboxChildResumeState } from "@app/lib/actions/types";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import { extractSandboxClaims } from "@app/lib/api/sandbox/call_tool";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { CallMCPToolResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

type CallToolPendingResponse = {
  status: "pending";
  childActionId: string;
};

type CallToolRejectedResponse = {
  status: "rejected";
};

type EndpointResponse = NextApiResponse<
  WithAPIErrorResponse<
    CallMCPToolResponseType | CallToolPendingResponse | CallToolRejectedResponse
  >
>;

/**
 * @ignoreswagger
 * internal endpoint
 *
 * POST /api/v1/w/[wId]/spaces/[spaceId]/mcp_server_views/[svId]/call_tool/[parentActionId]/[childActionId]
 *
 * Polls the child sandbox action's status. Tool execution itself is run by
 * the dedicated `runSandboxChildToolWorkflow` (kicked off by the initial
 * invoke endpoint or by `validateAction` on approval). The polling endpoint
 * just reads state.
 *
 *   - terminal succeeded  → 200 with the tool result
 *   - terminal errored    → 200 with `isError: true`
 *   - terminal denied     → 403 `{ status: "rejected" }`
 *   - anything else       → 202 `{ status: "pending" }`
 */

async function handler(
  req: NextApiRequest,
  res: EndpointResponse,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST is supported.",
      },
    });
  }

  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("sandbox_dsbx_tools")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Sandbox dsbx tools are not enabled for this workspace.",
      },
    });
  }

  const { svId, parentActionId, childActionId } = req.query;
  if (
    !isString(svId) ||
    !isString(parentActionId) ||
    !isString(childActionId)
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid path parameters.",
      },
    });
  }

  const view = await MCPServerViewResource.fetchById(auth, svId);
  if (!view || view.space.sId !== space.sId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "mcp_server_view_not_found",
        message: "MCP server view not found in this space.",
      },
    });
  }

  const sandboxClaims = await extractSandboxClaims(
    req.headers.authorization?.replace("Bearer ", "")
  );
  if (!sandboxClaims) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "Valid sandbox token required.",
      },
    });
  }

  if (sandboxClaims.aaId !== parentActionId) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "Sandbox token does not match the parent action in the URL.",
      },
    });
  }

  const child = await AgentMCPActionResource.fetchById(auth, childActionId);
  if (!child) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "Action not found.",
      },
    });
  }

  // Cross-check the child's inverse pointer against the URL's parent. With
  // the JWT also pinned to the URL's parentActionId above, this transitively
  // binds the child to the JWT's session — children share their parent's
  // agentMessageId, so no separate (cId, mId) check is needed.
  const childResumeState = child.stepContext.resumeState;
  if (
    !isSandboxChildResumeState(childResumeState) ||
    childResumeState.parentActionId !== parentActionId
  ) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Action does not belong to this parent.",
      },
    });
  }

  switch (child.status) {
    case "blocked_validation_required":
    case "blocked_authentication_required":
    case "blocked_file_authorization_required":
    case "blocked_child_action_input_required":
    case "blocked_user_answer_required":
    case "ready_allowed_explicitly":
    case "ready_allowed_implicitly":
    case "running":
      res.status(202).json({ status: "pending", childActionId: child.sId });
      return;

    case "succeeded":
    case "errored": {
      const [enriched] =
        await AgentMCPActionResource.enrichActionsWithOutputItems(auth, {
          actions: [child],
          ignoreContent: false,
        });
      res.status(200).json({
        success: true,
        result: {
          content: enriched?.output ?? [],
          isError: child.status === "errored",
        },
      });
      return;
    }

    case "denied":
      res.status(403).json({ status: "rejected" });
      return;

    default:
      assertNever(child.status);
  }
}

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
