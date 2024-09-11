/* eslint jsdoc/no-missing-syntax: 0 */ //
// Disabling jsdoc rule, as we're not yet documentating dust apps endpoints under vaults.
// We still document the legacy endpoint, which does the same thing.
// Note: for now, an API key only has access to the global vault.
import type { AppType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { apiError } from "@app/logger/withlogging";

export type GetAppsResponseBody = {
  apps: AppType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAppsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to access was not found",
      },
    });
  }

  // Handling the case where vId is undefined to keep support
  // for the legacy endpoint (not under vault, global vault assumed).
  const vault =
    req.query.vId === undefined
      ? await VaultResource.fetchWorkspaceGlobalVault(auth)
      : await VaultResource.fetchById(auth, req.query.vId as string);

  if (!vault) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "vault_not_found",
        message: "The vault you're trying to access was not found",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const apps = (await AppResource.listByVault(auth, vault)).map((app) =>
        app.toJSON()
      );
      res.status(200).json({
        apps,
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

export default withPublicAPIAuthentication(handler);
