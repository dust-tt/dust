/** @ignoreswagger */
import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import { publishMCPResults } from "@app/lib/api/assistant/mcp_events";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "16mb",
    },
  },
};

const PostMCPResultsRequestBodySchema = z.object({
  result: z.unknown(),
  serverId: z.string(),
});

type PostMCPResultsResponseType = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostMCPResultsResponseType>>,
  auth: Authenticator
): Promise<void> {
  const r = PostMCPResultsRequestBodySchema.safeParse(req.body);
  if (!r.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(r.error).toString(),
      },
    });
  }

  const { serverId, result } = r.data;

  const isValidAccess = await validateMCPServerAccess(auth, {
    serverId,
  });
  if (!isValidAccess) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "mcp_auth_error",
        message: "You don't have access to this MCP server or it has expired.",
      },
    });
  }

  // Publish MCP action results.
  await publishMCPResults(auth, {
    mcpServerId: serverId,
    result,
  });

  res.status(200).json({
    success: true,
  });

  return;
}

export default withSessionAuthenticationForWorkspace(handler);
