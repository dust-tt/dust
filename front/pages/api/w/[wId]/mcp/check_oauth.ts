import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { fetchRemoteServerMetaDataByURL } from "@app/lib/actions/mcp_metadata";
import { MCPOAuthRequiredError } from "@app/lib/actions/mcp_oauth_error";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPOAuthExtraConfig } from "@app/lib/api/oauth/providers/mcp";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type CheckOAuthResponseBody =
  | {
      oauthRequired: true;
      extraConfig: MCPOAuthExtraConfig;
    }
  | {
      oauthRequired: false;
    };

const PostQueryParamsSchema = t.type({
  url: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<CheckOAuthResponseBody>>,
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

      const { url } = r.right;

      const r2 = await fetchRemoteServerMetaDataByURL(auth, url);
      if (r2.isErr()) {
        if (r2.error instanceof MCPOAuthRequiredError) {
          return res.status(200).json({
            oauthRequired: true,
            // Return the oauth extraConfig to the client to allow them to handle the oauth flow.
            extraConfig: r2.error.extraConfig,
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
