import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { apiError } from "@app/logger/withlogging";
import type { GetDataSourceContentResponseBody } from "@app/pages/api/w/[wId]/vaults/[vId]/contentHandler";
import { getContentHandler } from "@app/pages/api/w/[wId]/vaults/[vId]/contentHandler";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDataSourceContentResponseBody>>,
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

  const dataSourceView = await DataSourceViewResource.fetchById(
    auth,
    req.query.dsvId as string
  );
  const dataSource = dataSourceView?.dataSource;

  if (!dataSourceView || !dataSource || dataSourceView.vaultId !== vault.id) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      return getContentHandler(req, res, dataSource, dataSourceView.parentsIn);

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
