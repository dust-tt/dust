import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { connectToMCPServer } from "@app/lib/actions/mcp_metadata";
import { MCPOAuthRequiredError } from "@app/lib/actions/mcp_oauth_error";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPOAuthConnectionMetadataType } from "@app/lib/api/oauth/providers/mcp";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { headersArrayToRecord } from "@app/types";

export type DiscoverOAuthMetadataResponseBody =
  | {
      oauthRequired: true;
      connectionMetadata: MCPOAuthConnectionMetadataType;
    }
  | {
      oauthRequired: false;
    };

const PostQueryParamsSchema = t.type({
  url: t.string,
  customHeaders: t.union([
    t.array(t.type({ key: t.string, value: t.string })),
    t.undefined,
  ]),
});

/**
 * This endpoint is used to discover the OAuth metadata for a remote MCP server.
 * It is used to check if the server requires OAuth authentication.
 * If it does, it returns the OAuth connection metadata to the client to allow them to handle the oauth flow.
 * If it does not, it returns a 200 status code with oauthRequired set to false.
 *
 * Note: this endpoint should not be called too frequently, as it is likely rate limited by the mcp server provider.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DiscoverOAuthMetadataResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { method } = req;

  switch (method) {
    case "POST": {
      const r = PostQueryParamsSchema.decode(req.body);

      if (isLeft(r)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body",
          },
        });
      }

      const { url, customHeaders } = r.right;

      const headers = headersArrayToRecord(customHeaders, {
        stripAuthorization: false,
      });

      const r2 = await connectToMCPServer(auth, {
        params: {
          type: "remoteMCPServerUrl",
          remoteMCPServerUrl: url,
          headers,
        },
      });
      if (r2.isErr()) {
        if (r2.error instanceof MCPOAuthRequiredError) {
          return res.status(200).json({
            oauthRequired: true,
            // Return the oauth connectionMetadata to the client to allow them to handle the oauth flow.
            connectionMetadata: r2.error.connectionMetadata,
          });
        } else {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: r2.error.message,
            },
          });
        }
      }
      return res.status(200).json({
        oauthRequired: false,
      });
    }

    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
