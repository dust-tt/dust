/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { SharingGrantType } from "@app/types/files";
import {
  isConversationFileUseCase,
  isInteractiveContentType,
} from "@app/types/files";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const AddGrantsRequestBodySchema = z.object({
  emails: z.array(z.string().email()).min(1).max(50),
});

const RevokeGrantRequestBodySchema = z.object({
  grantId: z.number(),
});

interface GrantsResponseBody {
  grants: SharingGrantType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GrantsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("email_restricted_sharing")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Email-restricted sharing is not enabled for this workspace.",
      },
    });
  }

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

  if (
    isConversationFileUseCase(file.useCase) &&
    file.useCaseMetadata?.conversationId
  ) {
    // For conversation files, check if the user has access to the conversation.
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

  // Only allow sharing Frame files.
  if (
    !file.isInteractiveContent ||
    !isInteractiveContentType(file.contentType)
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files support sharing grants.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const grants = await file.listActiveSharingGrants();

      return res.status(200).json({ grants });
    }

    case "POST": {
      const parseResult = AddGrantsRequestBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${parseResult.error.message}`,
          },
        });
      }

      const grants = await file.addSharingGrants(auth, {
        emails: parseResult.data.emails,
      });

      return res.status(200).json({ grants });
    }

    case "DELETE": {
      const parseResult = RevokeGrantRequestBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${parseResult.error.message}`,
          },
        });
      }

      const result = await file.revokeSharingGrant({
        grantId: parseResult.data.grantId,
      });

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "file_not_found",
            message: result.error.message,
          },
        });
      }

      res.status(204).end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Only GET, POST, and DELETE methods are supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
