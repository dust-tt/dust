// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import {
  type FileSystemEntry,
  SCOPED_PREFIX_CONVERSATION,
} from "@app/lib/api/file_system/types";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type { FileSystemEntry };

export type GetConversationFilesResponseBody = {
  files: FileSystemEntry[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetConversationFilesResponseBody>>,
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

  const conversation = await ConversationResource.fetchById(auth, cId);
  if (!conversation) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  const fsResult = await DustFileSystem.forConversation(
    auth,
    conversation.toJSON()
  );
  if (fsResult.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to initialise file system.",
      },
    });
  }

  // Scope the listing to the conversation mount only. For pod conversations the
  // DustFileSystem also has a pod mount and we do not want to expose pod files here.
  const files = await fsResult.value.list(`${SCOPED_PREFIX_CONVERSATION}${cId}`);

  return res.status(200).json({ files });
}

export default withSessionAuthenticationForWorkspace(handler);
