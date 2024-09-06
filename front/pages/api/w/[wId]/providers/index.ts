import type { ProviderType, WithAPIErrorResponse } from "@dust-tt/types";
import { redactString } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { Provider } from "@app/lib/resources/storage/models/apps";
import { apiError } from "@app/logger/withlogging";

export type GetProvidersResponseBody = {
  providers: ProviderType[];
};

function redactConfig(config: string) {
  const parsedConfig = JSON.parse(config);

  return JSON.stringify({
    ...parsedConfig,
    api_key: redactString(parsedConfig.api_key, 6),
  });
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetProvidersResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  // With Vaults we're moving Providers management to the Admin role.
  const isVaultsFeatureEnabled = owner.flags.includes("data_vaults_feature");
  const hasValidRole = isVaultsFeatureEnabled
    ? auth.isAdmin()
    : auth.isBuilder();

  if (!hasValidRole) {
    const errorMessage = isVaultsFeatureEnabled
      ? "Only the users that are `admins` for the current workspace can list providers."
      : "Only the users that are `builders` for the current workspace can list providers.";

    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "provider_auth_error",
        message: errorMessage,
      },
    });
  }

  switch (req.method) {
    case "GET":
      const providers = await Provider.findAll({
        where: {
          workspaceId: owner.id,
        },
      });

      res.status(200).json({
        providers: providers.map((p) => {
          return {
            providerId: p.providerId,
            config: redactConfig(p.config),
          };
        }),
      });
      return;

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
