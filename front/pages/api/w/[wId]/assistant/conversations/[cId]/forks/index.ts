// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { createConversationFork } from "@app/lib/api/assistant/conversation/forks";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const PostConversationForkBodySchema = z.object({
  sourceMessageId: z.string().optional(),
});

export type PostConversationForkResponseBody = {
  conversationId: string;
  parentConversationTitle: string | null;
  spaceId: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostConversationForkResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
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

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const requestBody = req.body === "" ? {} : (req.body ?? {});

  const bodyValidation = PostConversationForkBodySchema.safeParse(requestBody);
  if (!bodyValidation.success) {
    const pathError = fromError(bodyValidation.error).toString();
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const createRes = await createConversationFork(auth, {
    conversationId: cId,
    sourceMessageId: bodyValidation.data.sourceMessageId,
  });

  if (createRes.isErr()) {
    switch (createRes.error.code) {
      case "conversation_not_found":
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: createRes.error.message,
          },
        });
      case "unauthorized":
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: createRes.error.message,
          },
        });
      case "invalid_request_error":
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: createRes.error.message,
          },
        });
      case "internal_error":
      case "failed_to_copy_files":
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: createRes.error.message,
          },
        });
      default:
        assertNever(createRes.error.code);
    }
  }

  return res.status(200).json({
    conversationId: createRes.value.conversationId,
    parentConversationTitle: createRes.value.parentConversationTitle,
    spaceId: createRes.value.spaceId,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
