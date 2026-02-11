import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  MCPServerInstanceLimitError,
  registerMCPServer,
} from "@app/lib/api/actions/mcp/client_side_registry";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";

const MIN_SERVER_NAME_LENGTH = 5;
const MAX_SERVER_NAME_LENGTH = 30;
export const ClientSideMCPServerNameCodec = t.refinement(
  t.string,
  (s) =>
    s.trim().length >= MIN_SERVER_NAME_LENGTH &&
    s.trim().length <= MAX_SERVER_NAME_LENGTH
);

const PostMCPRegisterRequestBodyCodec = t.type({
  serverName: ClientSideMCPServerNameCodec,
});

export type PostMCPRegisterRequestBody = t.TypeOf<
  typeof PostMCPRegisterRequestBodyCodec
>;

type RegisterMCPResponseType = {
  expiresAt: string;
  serverId: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<RegisterMCPResponseType>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "invalid_request_error",
        message: "Method not allowed.",
      },
    });
  }

  const bodyValidation = PostMCPRegisterRequestBodyCodec.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid server name: ${pathError}`,
      },
    });
  }

  const { serverName } = bodyValidation.right;

  // Register the server.
  const registration = await registerMCPServer(auth, {
    serverName,
    workspaceId: auth.getNonNullableWorkspace().sId,
  });

  if (registration.isErr()) {
    const error = registration.error;
    // Check if this is a server instance limit error.
    if (error instanceof MCPServerInstanceLimitError) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    }

    // Other errors are treated as server errors.
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: error.message,
      },
    });
  }

  res.status(200).json(registration.value);
}

export default withSessionAuthenticationForWorkspace(handler);
