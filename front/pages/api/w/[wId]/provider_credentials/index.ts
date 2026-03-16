/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ProviderCredentialType } from "@app/types/provider_credential";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetProviderCredentialsResponseBody = {
  providerCredentials: ProviderCredentialType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetProviderCredentialsResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are `admins` for the current workspace can manage provider credentials.",
      },
    });
  }

  const plan = auth.getNonNullablePlan();
  if (!plan.isByok) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "BYOK is not enabled on this workspace's plan.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const providerCredentials =
        await ProviderCredentialResource.listByWorkspace(auth);

      return res.status(200).json({
        providerCredentials: providerCredentials.map((c) => c.toJSON()),
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
