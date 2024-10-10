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
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
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
  const user = auth.getNonNullableUser();

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
  const conversationRes = await getConversation(auth, conversationId);

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

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

export default withSessionAuthenticationForWorkspace(handler);
