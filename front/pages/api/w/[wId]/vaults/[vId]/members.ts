import type { VaultType, WithAPIErrorResponse } from "@dust-tt/types";
import { PatchGroupRequestBodySchema } from "@dust-tt/types";
import assert from "assert";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { UserResource } from "@app/lib/resources/user_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { apiError } from "@app/logger/withlogging";

export interface PatchVaultMembersResponseBody {
  vault: VaultType;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PatchVaultMembersResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const vault = await VaultResource.fetchById(auth, req.query.vId as string);
  if (!vault || !vault.canAdministrate(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "vault_not_found",
        message: "The vault you requested was not found.",
      },
    });
  }

  if (!vault.isRegular()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only regular vaults can have members.",
      },
    });
  }

  switch (req.method) {
    case "PATCH": {
      const regularGroups = vault.groups.filter(
        (group) => group.kind === "regular"
      );
      // Assert that there is exactly one regular group associated with the vault
      assert(
        regularGroups.length === 1,
        `Expected exactly one regular group for the vault, but found ${regularGroups.length}.`
      );
      const [defaultVaultGroup] = regularGroups;

      const bodyValidation = PatchGroupRequestBodySchema.decode(req.body);

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

      const { memberIds } = bodyValidation.right;
      if (memberIds) {
        const users = await UserResource.fetchByIds(memberIds);

        const result = await defaultVaultGroup.setMembers(
          auth,
          users.map((u) => u.toJSON())
        );

        if (result.isErr()) {
          if (result.error.code === "unauthorized") {
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "workspace_auth_error",
                message:
                  "Only users that are `admins` can administrate vault members.",
              },
            });
          } else {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: result.error.message,
              },
            });
          }
        }
      }

      return res.status(200).json({ vault: vault.toJSON() });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
