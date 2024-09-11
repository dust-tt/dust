import type { UserType, VaultType, WithAPIErrorResponse } from "@dust-tt/types";
import {
  DATA_SOURCE_VIEW_CATEGORIES,
  PatchVaultRequestBodySchema,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { deleteVault } from "@app/lib/api/vaults";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { apiError } from "@app/logger/withlogging";

export type VaultCategoryInfo = {
  usage: number;
  count: number;
};

export type GetVaultResponseBody = {
  vault: VaultType & {
    categories: { [key: string]: VaultCategoryInfo };
    members: UserType[];
  };
};

export type PatchVaultResponseBody = {
  vault: VaultType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetVaultResponseBody | PatchVaultResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const vault = await VaultResource.fetchById(auth, req.query.vId as string);

  if (!vault || !vault.canList(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "vault_not_found",
        message: "The vault you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const dataSourceViews = await DataSourceViewResource.listByVault(
        auth,
        vault
      );
      const serializedDatasourceViews = dataSourceViews.map((view) =>
        view.toJSON()
      );
      const apps = await AppResource.listByVault(auth, vault);

      const categories: { [key: string]: VaultCategoryInfo } = {};
      for (const category of DATA_SOURCE_VIEW_CATEGORIES) {
        categories[category] = {
          count: 0,
          usage: 0,
        };
      }

      for (const dataSource of serializedDatasourceViews) {
        categories[dataSource.category].count += 1;
        categories[dataSource.category].usage += dataSource.usage;
      }

      categories["apps"].count = apps.length;

      const currentMembers = (
        await Promise.all(
          vault.groups.map((group) => group.getActiveMembers(auth))
        )
      ).flat();
      return res.status(200).json({
        vault: {
          ...vault.toJSON(),
          categories,
          members: currentMembers.map((member) => member.toJSON()),
        },
      });
    }

    case "PATCH": {
      if (!auth.isAdmin() || !auth.isBuilder()) {
        // Only admins, or builders who have access to the vault, can patch
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Only users that are `admins` or `builder` can administrate vaults.",
          },
        });
      }
      const bodyValidation = PatchVaultRequestBodySchema.decode(req.body);

      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { content } = bodyValidation.right;

      if (content) {
        const currentViews = await DataSourceViewResource.listByVault(
          auth,
          vault
        );

        const viewByDataSourceName = currentViews.reduce(
          (acc, view) => {
            acc[view.dataSource.name] = view;
            return acc;
          },
          {} as { [key: string]: DataSourceViewResource }
        );

        for (const dataSourceConfig of content) {
          const view = viewByDataSourceName[dataSourceConfig.dataSource];
          if (view) {
            // Update existing view
            await view.updateParents(dataSourceConfig.parentsIn);
            await view.setEditedBy(auth);
          } else {
            // Create a new view
            const dataSource = await DataSourceResource.fetchByNameOrId(
              auth,
              dataSourceConfig.dataSource,
              // TODO(DATASOURCE_SID): Clean-up
              { origin: "vault_patch_content" }
            );
            if (dataSource) {
              await DataSourceViewResource.createViewInVaultFromDataSource(
                auth,
                vault,
                dataSource,
                dataSourceConfig.parentsIn
              );
            }
          }
        }

        for (const dataSourceName of Object.keys(viewByDataSourceName)) {
          if (!content.map((c) => c.dataSource).includes(dataSourceName)) {
            const view = viewByDataSourceName[dataSourceName];
            await view.delete(auth);
          }
        }
      }
      return res.status(200).json({ vault: vault.toJSON() });
    }

    case "DELETE": {
      if (!auth.isAdmin()) {
        // Only admins, who have access to the vault, can delete
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Only users that are `admins` or `builder` can administrate vaults.",
          },
        });
      }

      await deleteVault(auth, vault);

      return res.status(200).json({ vault: vault.toJSON() });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
