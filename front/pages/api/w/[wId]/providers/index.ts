import type { ProviderType, WithAPIErrorResponse } from "@dust-tt/types";
import { redactString } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { Authenticator, getSession } from "@app/lib/auth";
import { Provider } from "@app/lib/models/apps";
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
  res: NextApiResponse<WithAPIErrorResponse<GetProvidersResponseBody>>
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
        message: "The workspace you're trying to access was not found.",
      },
    });
  }

  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "provider_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can list providers.",
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
      return;
  }
}

export default withSessionAuthentication(handler);
