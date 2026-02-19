import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type PokeGetConversationConfig = {
  conversationDataSourceId: string | null;
  langfuseUiBaseUrl: string | null;
  temporalWorkspace: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetConversationConfig>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, cId } = req.query;
  if (!isString(wId) || !isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or conversation ID.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const cRes = await ConversationResource.fetchConversationWithoutContent(
        auth,
        cId
      );
      if (cRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: "Conversation not found.",
          },
        });
      }

      const conversationDataSource =
        await DataSourceResource.fetchByConversation(auth, cRes.value);

      const temporalWorkspace = config.getTemporalAgentNamespace() ?? "";
      return res.status(200).json({
        conversationDataSourceId: conversationDataSource?.sId ?? null,
        langfuseUiBaseUrl: config.getLangfuseUiBaseUrl() ?? null,
        temporalWorkspace,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
