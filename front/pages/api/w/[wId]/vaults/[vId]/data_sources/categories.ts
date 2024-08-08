import type { DataSourceCategory, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { apiError } from "@app/logger/withlogging";
import { getDataSourceInfos } from "@app/pages/api/w/[wId]/vaults/[vId]/data_sources";

type CategoryInfo = {
  category: DataSourceCategory;
  usage: number;
  count: number;
};

export type GetVaultDataSourceCategoriesResponseBody = {
  categories: CategoryInfo[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetVaultDataSourceCategoriesResponseBody>
  >,
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

  if (!vault || !auth.hasPermission([vault.acl()], "read")) {
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
      const all = await getDataSourceInfos(auth, vault);

      const categories = all.reduce((acc, dataSource) => {
        const value = acc.find((i) => i.category === dataSource.category);
        if (value) {
          value.count += 1;
          value.usage += dataSource.usage;
        } else {
          acc.push({
            category: dataSource.category,
            count: 1,
            usage: dataSource.usage,
          });
        }
        return acc;
      }, [] as CategoryInfo[]);

      res.status(200).json({
        categories,
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
