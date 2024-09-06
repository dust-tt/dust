import type { ProviderType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { Provider } from "@app/lib/resources/storage/models/apps";
import { apiError } from "@app/logger/withlogging";

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
  res: NextApiResponse<
    WithAPIErrorResponse<PostProviderResponseBody | DeleteProviderResponseBody>
  >,
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
      ? "Only the users that are `admins` for the current workspace can configure providers."
      : "Only the users that are `builders` for the current workspace can configure providers.";

    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "provider_auth_error",
        message: errorMessage,
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

export default withSessionAuthenticationForWorkspace(handler);
