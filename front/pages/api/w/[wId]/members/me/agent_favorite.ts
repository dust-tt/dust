import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { setAgentUserFavorite } from "@app/lib/api/assistant/user_relation";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type PostAgentUserFavoriteResponseBody = {
  agentId: string;
  userFavorite: boolean;
};

export const PostAgentUserFavoriteRequestBodySchema = t.type({
  agentId: t.string,
  userFavorite: t.boolean,
});

export type PostAgentUserFavoriteRequestBody = t.TypeOf<
  typeof PostAgentUserFavoriteRequestBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostAgentUserFavoriteResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "POST":
      const bodyValidation = PostAgentUserFavoriteRequestBodySchema.decode(
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

      const { agentId, userFavorite } = bodyValidation.right;

      const agentConfiguration = await getAgentConfiguration(
        auth,
        agentId,
        "light"
      );
      if (!agentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The agent requested was not found.",
          },
        });
      }

      const result = await setAgentUserFavorite({
        auth,
        agentId,
        userFavorite,
      });
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        });
      }
      res.status(200).json(result.value);
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
