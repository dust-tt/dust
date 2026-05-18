/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { deregisterMCPServer } from "@app/lib/api/actions/mcp/client_side_registry";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const PostMCPDeregisterRequestBodySchema = z.object({
  serverId: z.string(),
});

export type PostMCPDeregisterRequestBody = z.infer<
  typeof PostMCPDeregisterRequestBodySchema
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

  const bodyValidation = PostMCPDeregisterRequestBodySchema.safeParse(req.body);
  if (!bodyValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
      },
    });
  }

  const { serverId } = bodyValidation.data;

  await deregisterMCPServer(auth, { serverId });

  res.status(200).json({ success: true });
}

export default withSessionAuthenticationForWorkspace(handler);
