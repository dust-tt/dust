/** @ignoreswagger */
import { deregisterMCPServer } from "@app/lib/api/actions/mcp/client_side_registry";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

const PostMCPDeregisterRequestBodyCodec = t.type({
  serverId: t.string,
});

export type PostMCPDeregisterRequestBody = t.TypeOf<
  typeof PostMCPDeregisterRequestBodyCodec
>;

type DeregisterMCPResponseType = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DeregisterMCPResponseType>>,
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

  const bodyValidation = PostMCPDeregisterRequestBodyCodec.decode(req.body);
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

  const { serverId } = bodyValidation.right;

  await deregisterMCPServer(auth, { serverId });

  res.status(200).json({ success: true });
}

export default withSessionAuthenticationForWorkspace(handler);
