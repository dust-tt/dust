import { ProviderType } from "@dust-tt/types";
import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { Provider } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetProvidersResponseBody = {
  providers: ProviderType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetProvidersResponseBody>
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
            config: p.config,
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

export default withLogging(handler);
