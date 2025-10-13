import type { PublicFrameResponseBodyType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAuthForSharedEndpoint } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { frameContentType } from "@app/types";

/**
 * @ignoreswagger
 *
 * Undocumented API endpoint to get a frame by its public share token.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PublicFrameResponseBodyType>>
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

  const { token } = req.query;
  if (typeof token !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing token parameter.",
      },
    });
  }

  const result = await FileResource.fetchByShareTokenWithContent(token);
  if (!result) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const workspace = await WorkspaceResource.fetchByModelId(
    result.file.workspaceId
  );

  if (!workspace) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const { file, content: fileContent, shareScope } = result;

  // Only allow conversation Frame files.
  if (!file.isInteractiveContent && file.contentType === frameContentType) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame can be shared publicly.",
      },
    });
  }

  // Check if file is safe to display.
  if (!file.isSafeToDisplay()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "File is not safe for public display.",
      },
    });
  }

  const auth = await getAuthForSharedEndpoint(req, res, workspace.sId);

  // For workspace sharing, check authentication.
  if (shareScope === "workspace") {
    if (!auth) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "File not found.",
        },
      });
    }
  }

  const conversationId = file.useCaseMetadata?.conversationId;
  const user = auth && auth.user();

  let isParticipant = false;

  if (user && conversationId) {
    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversationId
    );

    if (user && conversationResource) {
      isParticipant =
        await conversationResource.isConversationParticipant(user);
    }
  }

  res.status(200).json({
    content: fileContent,
    file: file.toJSON(),
    // Only return the conversation URL if the user is a participant of the conversation.
    conversationUrl: isParticipant
      ? `${config.getClientFacingUrl()}/w/${workspace.sId}/agent/${conversationId}`
      : null,
  });
}

export default handler;
