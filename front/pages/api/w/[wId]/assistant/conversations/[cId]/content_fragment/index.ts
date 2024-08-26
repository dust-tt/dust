import type { ContentFragmentType, WithAPIErrorResponse } from "@dust-tt/types";
import { InternalPostContentFragmentRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import type * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  getConversation,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import { withSessionAuthenticationForWorkspaceAsUser } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export type PostContentFragmentRequestBody = t.TypeOf<
  typeof InternalPostContentFragmentRequestBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{ contentFragment: ContentFragmentType }>
  >,
  auth: Authenticator
): Promise<void> {
  const user = auth.user();
  if (!user || !auth.isUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "Could not find the user of the current session.",
      },
    });
  }

  if (!(typeof req.query.cId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const conversationId = req.query.cId;
  const conversation = await getConversation(auth, conversationId);
  if (!conversation) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation =
        InternalPostContentFragmentRequestBodySchema.decode(req.body);

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

      const contentFragmentPayload = bodyValidation.right;
      const baseContext = {
        username: user.username,
        fullName: user.fullName,
        email: user.email,
      };

      const contentFragmentRes = await postNewContentFragment(
        auth,
        conversation,
        contentFragmentPayload,
        {
          ...baseContext,
          profilePictureUrl: contentFragmentPayload.context.profilePictureUrl,
        }
      );
      if (contentFragmentRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: contentFragmentRes.error.message,
          },
        });
      }

      res.status(200).json({ contentFragment: contentFragmentRes.value });
      return;

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

export default withSessionAuthenticationForWorkspaceAsUser(handler);
