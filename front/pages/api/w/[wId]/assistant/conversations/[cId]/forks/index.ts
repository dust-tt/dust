/** @ignoreswagger */
import { createConversationFork } from "@app/lib/api/assistant/conversation/forks";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

const PostConversationForkBodySchema = t.partial({
  sourceMessageId: t.string,
});

export type PostConversationForkResponseBody = {
  conversationId: string;
  // TODO(sessions): Remove after all clients use `conversationId`.
  conversation: Pick<ConversationType, "sId">;
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

  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("sessions_branching")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "feature_flag_not_found",
        message: "The feature is not enabled for this workspace.",
      },
    });
  }

  const requestBody = req.body === "" ? {} : (req.body ?? {});

  const bodyValidation = PostConversationForkBodySchema.decode(requestBody);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
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
    sourceMessageId: bodyValidation.right.sourceMessageId,
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
      case "invalid_request_error":
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: createRes.error.message,
          },
        });
      case "internal_error":
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
    conversationId: createRes.value,
    conversation: {
      sId: createRes.value,
    },
  });
}

export default withSessionAuthenticationForWorkspace(handler);
