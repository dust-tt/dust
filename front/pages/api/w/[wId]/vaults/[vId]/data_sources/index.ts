import type {
  DataSourceOrViewInfo,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSourceInfos } from "@app/lib/api/vaults";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { apiError } from "@app/logger/withlogging";

export type GetVaultDataSourcesResponseBody = {
  dataSources: DataSourceOrViewInfo[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetVaultDataSourcesResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you requested was not found.",
      },
    });
  }

  const vault = await VaultResource.fetchById(auth, req.query.vId as string);

  if (
    !vault ||
    (!auth.isAdmin() && !auth.hasPermission([vault.acl()], "read"))
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "vault_not_found",
        message: "The vault you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const category =
        req.query.category && typeof req.query.category === "string"
          ? req.query.category
          : null;

      const all = await getDataSourceInfos(auth, vault);

      return res.status(200).json({
        dataSources: all.filter(
          (dataSourceInfo) => !category || dataSourceInfo.category === category
        ),
      });
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
