/** @ignoreswagger
 * Internal endpoint used by the UI to read the conversation's active plan file. Undocumented.
 */
import {
  PLAN_MODE_SERVER_NAME,
  REQUEST_PLAN_APPROVAL_TOOL_NAME,
} from "@app/lib/api/actions/servers/plan_mode/metadata";
import { getLightConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { findActivePlanFile } from "@app/lib/api/assistant/plan_mode";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getFileContent } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { FileType } from "@app/types/files";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type PlanApprovalState = "draft" | "pending" | "approved";

export type GetConversationPlanModeResponseBody = {
  planFile: FileType | null;
  content: string | null;
  approvalState: PlanApprovalState;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetConversationPlanModeResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only GET method is supported.",
      },
    });
  }

  const { cId } = req.query;
  if (!isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  // Ensure the caller has access to the conversation.
  const conversationRes = await getLightConversation(auth, cId);
  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const planFile = await findActivePlanFile(auth, cId);
  if (!planFile) {
    return res.status(200).json({
      planFile: null,
      content: null,
      approvalState: "draft",
    });
  }

  // Sequential fetches to avoid holding multiple DB connections from the pool simultaneously.
  const content = await getFileContent(auth, planFile, "original");
  const conversationResource = await ConversationResource.fetchById(auth, cId);
  const blockedActions = conversationResource
    ? await AgentMCPActionResource.listBlockedActionsForConversation(
        auth,
        conversationResource
      )
    : [];

  const hasPendingApproval = blockedActions.some(
    (a) =>
      a.metadata.mcpServerName === PLAN_MODE_SERVER_NAME &&
      a.metadata.toolName === REQUEST_PLAN_APPROVAL_TOOL_NAME
  );

  const approvalState: PlanApprovalState = hasPendingApproval
    ? "pending"
    : planFile.useCaseMetadata?.planModeLastApproval != null
      ? "approved"
      : "draft";

  return res.status(200).json({
    planFile: planFile.toJSON(auth),
    content,
    approvalState,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
