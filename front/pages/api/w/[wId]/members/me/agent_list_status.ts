import { AgentUserListStatus } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { setAgentUserListstatus } from "@app/lib/api/assistant/user_relation";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostAgentListStatusResponseBody = {
  agentId: string;
  listStatus: AgentUserListStatus;
};

export const PostAgentListStatusRequestBodySchema = t.type({
  agentId: t.string,
  listStatus: t.union([t.literal("in-list"), t.literal("not-in-list")]),
});

export type PostAgentListStatusRequestBody = t.TypeOf<
  typeof PostAgentListStatusRequestBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostAgentListStatusResponseBody | { success: boolean }>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const user = auth.user();
  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "The user requested was not found.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users of the current workspace are authorized to access this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation = PostAgentListStatusRequestBodySchema.decode(
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

      const { agentId, listStatus } = bodyValidation.right;

      const agentConfiguration = await getAgentConfiguration(auth, agentId);
      if (!agentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The agent requested was not found.",
          },
        });
      }

      const result = await setAgentUserListstatus({
        auth,
        agentId,
        listStatus,
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

export default withLogging(handler);
