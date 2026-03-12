import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { FileTypeWithMetadata } from "@app/types/files";
import { isConversationFileUseCase } from "@app/types/files";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const SaveInProjectRequestBodySchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
});

export type SaveInProjectResponseBody = {
  file: FileTypeWithMetadata;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SaveInProjectResponseBody>>,
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

  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  if (!featureFlags.includes("projects")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Projects feature is not enabled for this workspace.",
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

  // Only allow moving frame files.
  if (!file.isInteractiveContent) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files can be saved to a project.",
      },
    });
  }

  // Only allow moving files that are currently in a conversation (tool_output or conversation use case).
  if (!isConversationFileUseCase(file.useCase)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Only conversation frame files can be saved to a project. This file is already in a project or has another use case.",
      },
    });
  }

  // Verify user has access to the conversation that owns this file.
  if (file.useCaseMetadata?.conversationId) {
    const conversation = await ConversationResource.fetchById(
      auth,
      file.useCaseMetadata.conversationId
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

  const parseResult = SaveInProjectRequestBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${parseResult.error.message}`,
      },
    });
  }

  const { projectId } = parseResult.data;

  const space = await SpaceResource.fetchById(auth, projectId);
  if (!space) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "Project not found.",
      },
    });
  }

  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The given space is not a project.",
      },
    });
  }

  if (!space.canWrite(auth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "You do not have write access to this project.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      await file.moveFrameToSpace(auth, { projectId });

      return res.status(200).json({
        file: file.toJSONWithMetadata(auth),
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

export default withSessionAuthenticationForWorkspace(handler);
