import type { VaultType, WithAPIErrorResponse } from "@dust-tt/types";
import { PatchVaultRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getAPIKey } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetVaultResponseBody = {
  vault: VaultType;
};

/**
 * @swagger
 * /api/v1/w/{wId}/vaults:
 *   get:
 *     summary: Get vault info
 *     description: Get the list of all vaults for the workspace identified by {wId}.
 *     tags:
 *       - Vaults
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: vId
 *         required: true
 *         description: Unique string identifier for the vault
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The vault
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Vault'
 *   patch:
 *     summary: Patch a vault
 *     description: Patch an existing vault with new members / datasources
 *     tags:
 *       - Vaults
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: vId
 *         required: true
 *         description: Unique string identifier for the vault
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the vault
 *               members:
 *                 type: array
 *                 items:
 *                   type: string
 *                   description: List of allowed authentication providers
 *     responses:
 *       200:
 *         description: The vault
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Vault'
 *       400:
 *         description: Invalid request
 *       405:
 *         description: Method not supported


*/

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetVaultResponseBody>>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  const { workspaceAuth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const owner = workspaceAuth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you requested was not found.",
      },
    });
  }

  const vault = await VaultResource.fetchById(
    workspaceAuth,
    req.query.vId as string
  );

  if (!vault) {
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
        const currentMembers = await group.getActiveMembers(workspaceAuth);
        await Promise.all(
          members
            .filter(
              (memberId) => !currentMembers.map((m) => m.sId).includes(memberId)
            )
            .map(async (member) => {
              const user = await UserResource.fetchById(member);
              if (user) {
                return group.addMember(workspaceAuth, user?.toJSON());
              }
            })
        );
        await Promise.all(
          currentMembers
            .filter((currentMember) => !members.includes(currentMember.sId))
            .map(async (member) => {
              return group.removeMember(workspaceAuth, member.toJSON());
            })
        );
      }

      if (content) {
        const currentViews = await DataSourceViewResource.listByVault(
          workspaceAuth,
          vault
        );

        const viewByDataSourceName: { [key: string]: DataSourceViewResource } =
          {};

        for (const view of currentViews) {
          const dataSource = await view.fetchDataSource(workspaceAuth);
          if (dataSource) {
            viewByDataSourceName[dataSource.name] = view;
          }
        }

        for (const dataSourceConfig of content) {
          const view = viewByDataSourceName[dataSourceConfig.dataSource];
          if (view) {
            // Update existing view
            await view.updateParents(workspaceAuth, dataSourceConfig.parentsIn);
          } else {
            // Create a new view
            const dataSource = await DataSourceResource.fetchByName(
              workspaceAuth,
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
            await view.delete(workspaceAuth);
          }
        }
      }

      return res.status(200).json({ vault: vault.toJSON() });

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

export default withLogging(handler);
