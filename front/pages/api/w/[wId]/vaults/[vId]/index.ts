import type { VaultType, WithAPIErrorResponse } from "@dust-tt/types";
import { PatchVaultRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { apiError } from "@app/logger/withlogging";

export type GetVaultResponseBody = {
  vault: VaultType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetVaultResponseBody>>,
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
      res.status(200).json({ vault: vault.toJSON() });
      return;
    case "PATCH":
      if (!auth.isAdmin() || !auth.isBuilder()) {
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

      const { members, content } = bodyValidation.right;

      if (members) {
        const currentMembers = await group.getActiveMembers(auth);
        await Promise.all(
          members
            .filter(
              (memberId) => !currentMembers.map((m) => m.sId).includes(memberId)
            )
            .map(async (member) => {
              const user = await UserResource.fetchById(member);
              if (user) {
                return group.addMember(auth, user?.toJSON());
              }
            })
        );
        await Promise.all(
          currentMembers
            .filter((currentMember) => !members.includes(currentMember.sId))
            .map(async (member) => {
              return group.removeMember(auth, member.toJSON());
            })
        );
      }

      if (content) {
        const currentViews = await DataSourceViewResource.listByVault(
          auth,
          vault
        );

        const viewByDataSourceName = currentViews.reduce(
          (acc, view) => {
            if (view.dataSource) {
              acc[view.dataSource.name] = view;
            }
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
                dataSource.toJSON(),
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
