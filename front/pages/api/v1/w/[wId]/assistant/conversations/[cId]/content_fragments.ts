import type { ContentFragmentType, WithAPIErrorReponse } from "@dust-tt/types";
import { PublicPostContentFragmentRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import type * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  getConversation,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostContentFragmentsResponseBody = {
  contentFragment: ContentFragmentType;
};

export type PostContentFragmentRequestBody = t.TypeOf<
  typeof PublicPostContentFragmentRequestBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<PostContentFragmentsResponseBody>>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const { auth, keyWorkspaceId } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  if (!auth.isBuilder() || keyWorkspaceId !== req.query.wId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The Assistant API is only available on your own workspace.",
      },
    });
  }

  const conversation = await getConversation(auth, req.query.cId as string);
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
      const bodyValidation = PublicPostContentFragmentRequestBodySchema.decode(
        req.body
      );

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

      const { content, title, url, contentType, context } =
        bodyValidation.right;

      if (content.length === 0 || content.length > 64 * 1024) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The content must be a non-empty string of less than 64kb.",
          },
        });
      }

      const contentFragment = await postNewContentFragment(auth, {
        conversation,
        title,
        content,
        url,
        contentType,
        context: {
          username: context?.username || null,
          fullName: context?.fullName || null,
          email: context?.email || null,
          profilePictureUrl: context?.profilePictureUrl || null,
        },
      });

      res.status(200).json({ contentFragment });
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

export default withLogging(handler);
