import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ExtensionConfigurationResource } from "@app/lib/resources/extension";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetExtensionConfigResponseBody = {
  blacklistedDomains: string[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetExtensionConfigResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const config =
        await ExtensionConfigurationResource.fetchForWorkspace(auth);

      return res.status(200).json({
        blacklistedDomains: config?.blacklistedDomains ?? [],
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
