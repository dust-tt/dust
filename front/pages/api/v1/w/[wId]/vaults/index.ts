import type { VaultType, WithAPIErrorResponse } from "@dust-tt/types";
import { PostVaultRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getAPIKey } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetVaultsResponseBody = {
  vaults: VaultType[];
};

export type PostVaultsResponseBody = {
  vault: VaultType;
};

/**
 * @swagger
 * /api/v1/w/{wId}/apps/{aId}/runs/{runId}:
 *   get:
 *     summary: Get vaults list
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
 *     responses:
 *       200:
 *         description: The vaults
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Vault'
 *   post:
 *     summary: Create a new vault
 *     description: Create a new vault in the workspace identified by {wId}.
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
  res: NextApiResponse<
    WithAPIErrorResponse<GetVaultsResponseBody | PostVaultsResponseBody>
  >
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

  switch (req.method) {
    case "GET":
      const vaults = await VaultResource.listWorkspaceVaults(workspaceAuth);

      res.status(200).json({ vaults: vaults.map((vault) => vault.toJSON()) });
      return;
    case "POST":
      const bodyValidation = PostVaultRequestBodySchema.decode(req.body);

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

      const { name, members } = bodyValidation.right;

      const group = await GroupResource.makeNew({
        name: `Group for vault ${name}`,
        workspaceId: owner.id,
        type: "regular",
      });

      if (members) {
        await Promise.all(
          members?.map(async (member) => {
            const user = await UserResource.fetchById(member);
            if (user) {
              return group.addMember(workspaceAuth, user?.toJSON());
            }
          })
        );
      }

      const vault = await VaultResource.makeNew({
        name,
        kind: "regular",
        workspaceId: owner.id,
        groupId: group.id,
      });
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
