import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { verifySandboxExecToken } from "@app/lib/api/sandbox/access_tokens";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { apiError } from "@app/logger/withlogging";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

type CallToolPendingResponse = {
  status: "pending";
  actionId: string;
};

type CallToolRejectedResponse = {
  status: "rejected";
};

type CallToolSuccessResponse = {
  status: "success";
  action: AgentMCPActionWithOutputType;
};

export type FetchConversationMessageActionResponse =
  | CallToolSuccessResponse
  | CallToolPendingResponse
  | CallToolRejectedResponse;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<FetchConversationMessageActionResponse>
  >,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const claims = await verifySandboxExecToken(req.headers.authorization ?? "");
  if (!claims) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "not_authenticated",
        message: "The authentication token is invalid.",
      },
    });
  }

  const { aId } = req.query;
  if (!isString(aId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `aId` is required.",
      },
    });
  }

  const action = await AgentMCPActionResource.fetchById(auth, aId);
  if (!action) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "action_not_found",
        message: "Action not found.",
      },
    });
  }

  // Scope the action lookup to the token's agent message — prevents a token
  // leaking access to actions on other messages of the same workspace.
  if (
    !isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo) ||
    action.stepContext.sandboxChildActionInfo?.parentActionId !==
      claims.actionId
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "action_not_found",
        message: "Action not found.",
      },
    });
  }

  if (!isToolExecutionStatusFinal(action.status)) {
    return res.status(202).json({ status: "pending", actionId: action.sId });
  }

  switch (action.status) {
    case "succeeded":
    case "errored": {
      const [enriched] =
        await AgentMCPActionResource.enrichActionsWithOutputItems(auth, {
          actions: [action],
          ignoreContent: false,
        });
      return res.status(200).json({ status: "success", action: enriched });
    }
    case "denied":
      return res.status(403).json({ status: "rejected" });
    default:
      assertNever(action.status);
  }
}

export default withPublicAPIAuthentication(handler);
