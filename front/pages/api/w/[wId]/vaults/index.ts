import type { VaultType, WithAPIErrorResponse } from "@dust-tt/types";
import { PostVaultRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetVaultsResponseBody = {
  vaults: VaultType[];
};

export type PostVaultsResponseBody = {
  vault: VaultType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetVaultsResponseBody | PostVaultsResponseBody>
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

  switch (req.method) {
    case "GET":
      const vaults = await VaultResource.listWorkspaceVaults(auth);

      return res.status(200).json({
        vaults: vaults
          .filter(
            (vault) =>
              auth.isAdmin() || auth.hasPermission([vault.acl()], "read")
          )
          .map((vault) => vault.toJSON()),
      });
    case "POST":
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

      const nameAvailable = await VaultResource.isNameAvailable(auth, name);
      if (!nameAvailable) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "vault_already_exists",
            message: "This vault name is already used.",
          },
        });
      }

      const group = await GroupResource.makeNew({
        name: `Group for vault ${name}`,
        workspaceId: owner.id,
        type: "regular",
      });

      const vault = await VaultResource.makeNew({
        name,
        kind: "regular",
        workspaceId: owner.id,
        groupId: group.id,
      });

      if (members) {
        const users = (await UserResource.fetchByIds(members)).map((user) =>
          user.toJSON()
        );
        const groupsResult = await group.addMembers(auth, users);
        if (groupsResult.isErr()) {
          logger.error(
            {
              error: groupsResult.error,
            },
            "The vault cannot be created - group members could not be added"
          );
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "The vault cannot be created.",
            },
          });
        }
      }

      return res.status(201).json({ vault: vault.toJSON() });
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
