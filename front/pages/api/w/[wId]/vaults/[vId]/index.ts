import type { UserType, VaultType, WithAPIErrorResponse } from "@dust-tt/types";
import { PatchVaultRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  getDataSourceInfos,
  getDataSourceViewsInfo,
} from "@app/lib/api/vaults";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
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

  // Check if the user has access to the vault - either they are an admin or they have read access
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

  const group = await GroupResource.fetchByModelId(vault.groupId);
  if (!group) {
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
      const all = [
        ...(await getDataSourceInfos(auth, vault)),
        ...(await getDataSourceViewsInfo(auth, vault)),
      ];

      const categories = all.reduce(
        (acc, dataSource) => {
          const value = acc[dataSource.category];
          if (value) {
            value.count += 1;
            value.usage += dataSource.usage;
          } else {
            acc[dataSource.category] = {
              count: 1,
              usage: dataSource.usage,
            };
          }
          return acc;
        },
        {} as { [key: string]: VaultCategoryInfo }
      );

      const currentMembers = await group.getActiveMembers(auth);
      return res.status(200).json({
        vault: {
          ...vault.toJSON(),
          categories,
          members: currentMembers.map((member) => member.toJSON()),
        },
      });
    case "PATCH":
      if (!auth.isAdmin() || !auth.isBuilder()) {
        // Only admins, or builders who have to the vault, can patch
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

      const { memberIds, content } = bodyValidation.right;

      if (memberIds) {
        const users = (await UserResource.fetchByIds(memberIds)).map((user) =>
          user.toJSON()
        );
        await group.setMembers(auth, users);
      }

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
            await view.updateParents(auth, dataSourceConfig.parentsIn);
          } else {
            // Create a new view
            const dataSource = await DataSourceResource.fetchByName(
              auth,
              dataSourceConfig.dataSource
            );
            if (dataSource) {
              await DataSourceViewResource.createViewInVaultFromDataSource(
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
