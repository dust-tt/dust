/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { editClientExecutableFile } from "@app/lib/api/files/client_executable";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import {
  isConversationFileUseCase,
  isInteractiveContentType,
} from "@app/types/files";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const EditTextRequestBodySchema = z.object({
  newText: z.string(),
  oldText: z.string().min(1, "oldText must be a non-empty string"),
});

export type EditTextResponseBody = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<EditTextResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { fileId } = req.query;
  if (!isString(fileId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing fileId query parameter.",
      },
    });
  }

  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  if (!isInteractiveContentType(file.contentType)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files support inline text editing.",
      },
    });
  }

  if (
    isConversationFileUseCase(file.useCase) &&
    file.useCaseMetadata?.conversationId
  ) {
    const conversation = await ConversationResource.fetchById(
      auth,
      file.useCaseMetadata.conversationId
    );
    if (!conversation) {
      return apiError(req, res, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }
  } else if (file.useCaseMetadata?.spaceId) {
    const space = await SpaceResource.fetchById(
      auth,
      file.useCaseMetadata.spaceId
    );
    if (!space || !space.canWrite(auth)) {
      return apiError(req, res, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }
  } else {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  switch (req.method) {
    case "POST": {
      const bodyResult = EditTextRequestBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: bodyResult.error.errors.map((e) => e.message).join(", "),
          },
        });
      }

      const { oldText, newText } = bodyResult.data;

      const editResult = await editClientExecutableFile(auth, {
        fileId,
        oldString: oldText,
        newString: newText,
      });

      if (editResult.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: editResult.error.message,
          },
        });
      }

      return res.status(200).json({ success: true });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
