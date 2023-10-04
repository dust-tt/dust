import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { Provider } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";
import { ProviderType } from "@app/types/provider";

export type PostProviderResponseBody = {
  provider: ProviderType;
};

export type DeleteProviderResponseBody = {
  provider: {
    providerId: string;
  };
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostProviderResponseBody | DeleteProviderResponseBody>
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
        type: "provider_not_found",
        message: "The provider you're trying to check was not found.",
      },
    });
  }

  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "provider_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can configure providers.",
      },
    });
  }

  let [provider] = await Promise.all([
    Provider.findOne({
      where: {
        workspaceId: owner.id,
        providerId: req.query.pId,
      },
    }),
  ]);

  if (!req.query.pId || typeof req.query.pId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid provider ID in request parameters.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      if (!req.body || !(typeof req.body.config === "string")) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid configuration in provider update request body.",
          },
        });
      }

      if (!provider) {
        provider = await Provider.create({
          providerId: req.query.pId,
          config: req.body.config,
          workspaceId: owner.id,
        });

        res.status(201).json({
          provider: {
            providerId: provider.providerId,
            config: provider.config,
          },
        });
      } else {
        await provider.update({
          config: req.body.config,
        });

        res.status(200).json({
          provider: {
            providerId: provider.providerId,
            config: provider.config,
          },
        });
      }
      return;

    case "DELETE":
      if (!provider) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "provider_not_found",
            message: "The provider you're trying to delete was not found.",
          },
        });
      }

      await Provider.destroy({
        where: {
          workspaceId: owner.id,
          providerId: req.query.pId,
        },
      });

      res.status(200).json({
        provider: {
          providerId: req.query.pId,
        },
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or DELETE is expected.",
        },
      });
  }
}

export default withLogging(handler);
