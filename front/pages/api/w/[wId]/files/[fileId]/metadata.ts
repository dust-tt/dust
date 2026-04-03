/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { FileType } from "@app/types/files";
import { isConversationFileUseCase } from "@app/types/files";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<FileType>>,
  auth: Authenticator,
  { file }: { file: FileResource }
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

  const { useCase, useCaseMetadata } = file;
  const space = useCaseMetadata?.spaceId
    ? await SpaceResource.fetchById(auth, useCaseMetadata.spaceId)
    : null;

  if (useCase === "folders_document" && (!space || !space.canRead(auth))) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  // Check permissions based on useCase and useCaseMetadata.
  if (isConversationFileUseCase(useCase) && useCaseMetadata?.conversationId) {
    const conversation = await ConversationResource.fetchById(
      auth,
      useCaseMetadata.conversationId
    );

    if (!conversation) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "File not found.",
        },
      });
    }
  }

  return res.status(200).json(file.toJSONWithMetadata(auth));
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { file: {} })
);
