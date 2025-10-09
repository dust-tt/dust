import type { PublicFrameResponseBodyType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import {
  ConversationModel,
  ConversationParticipantModel,
} from "@app/lib/models/assistant/conversation";
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
  const session = await getSession(req, res);

  // For workspace sharing, check authentication.
  if (shareScope === "workspace") {
    const auth = await Authenticator.fromSession(session, workspace.sId);
    if (!auth.isUser()) {
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

  let participant: ConversationParticipantModel | null = null;

  if (session && conversationId) {
    const auth = await Authenticator.fromSession(session, workspace.sId);
    const user = auth.user();

    const conversation = await ConversationModel.findOne({
      where: { sId: conversationId },
    });

    if (user && conversation) {
      participant = await ConversationParticipantModel.findOne({
        where: {
          conversationId: conversation.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: user.id,
        },
      });
    }
  }

  res.status(200).json({
    content: fileContent,
    file: file.toJSON(),
    conversationId:
      participant !== null && conversationId ? conversationId : null,
  });
}

export default handler;
