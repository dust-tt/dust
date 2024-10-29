import type { SpaceType, WithAPIErrorResponse } from "@dust-tt/types";
import { PostVaultRequestBodySchema, removeNulls } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { isPrivateSpacesLimitReached } from "@app/lib/spaces";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetVaultsResponseBody = {
  vaults: SpaceType[];
};

export type PostVaultsResponseBody = {
  vault: SpaceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetVaultsResponseBody | PostVaultsResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "GET":
      const { role, kind } = req.query;

      if (
        (role && typeof role !== "string") ||
        (kind && typeof kind !== "string")
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request query parameters.",
          },
        });
      }

      let spaces: SpaceResource[] = [];

      if (role && role === "admin") {
        if (!auth.isAdmin()) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message:
                "Only users that are `admins` can see all spaces in the workspace.",
            },
          });
        }
        if (kind && kind === "system") {
          const systemSpace =
            await SpaceResource.fetchWorkspaceSystemSpace(auth);
          spaces = systemSpace ? [systemSpace] : [];
        } else {
          spaces = await SpaceResource.listWorkspaceSpaces(auth);
        }
      } else {
        spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
      }

      return res.status(200).json({
        vaults: spaces.map((s) => s.toJSON()),
      });

    case "POST":
      if (!auth.isAdmin() || !auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Only users that are `admins` or `builder` can administrate spaces.",
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

      const plan = auth.getNonNullablePlan();
      const all = await SpaceResource.listWorkspaceSpaces(auth);
      const isLimitReached = isPrivateSpacesLimitReached(
        all.map((v) => v.toJSON()),
        plan
      );

      if (isLimitReached) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The maximum number of spaces has been reached.",
          },
        });
      }

      const { name, memberIds, isRestricted } = bodyValidation.right;

      const nameAvailable = await SpaceResource.isNameAvailable(auth, name);
      if (!nameAvailable) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "vault_already_exists",
            message: "This space name is already used.",
          },
        });
      }

      const group = await GroupResource.makeNew({
        name: `Group for space ${name}`,
        workspaceId: owner.id,
        kind: "regular",
      });

      const globalGroupRes = isRestricted
        ? null
        : await GroupResource.fetchWorkspaceGlobalGroup(auth);

      const groups = removeNulls([
        group,
        globalGroupRes?.isOk() ? globalGroupRes.value : undefined,
      ]);

      const space = await SpaceResource.makeNew(
        {
          name,
          kind: "regular",
          workspaceId: owner.id,
        },
        groups
      );

      if (memberIds) {
        const users = (await UserResource.fetchByIds(memberIds)).map((user) =>
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

      return res.status(201).json({ vault: space.toJSON() });

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
