import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import isString from "lodash/isString";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";
import type { UserType, WithAPIErrorResponse } from "@app/types";
import { assertNever } from "@app/types";

const PatchSkillEditorsRequestBodySchema = t.intersection([
  t.type({}),
  t.partial({
    addEditorIds: t.array(t.string),
    removeEditorIds: t.array(t.string),
  }),
  t.refinement(
    t.type({
      addEditorIds: t.union([t.array(t.string), t.undefined]),
      removeEditorIds: t.union([t.array(t.string), t.undefined]),
    }),
    (body) =>
      (body.addEditorIds instanceof Array && body.addEditorIds.length > 0) ||
      (body.removeEditorIds instanceof Array &&
        body.removeEditorIds.length > 0),
    "Either addEditorIds or removeEditorIds must be provided and contain at least one ID."
  ),
]);

export type PatchSkillEditorsRequestBody = t.TypeOf<
  typeof PatchSkillEditorsRequestBodySchema
>;

export interface GetSkillEditorsResponseBody {
  editors: UserType[];
}

export interface PatchSkillEditorsResponseBody {
  editors: UserType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetSkillEditorsResponseBody | PatchSkillEditorsResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const skillId = req.query.sId;

  if (!isString(skillId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill id.",
      },
    });
  }

  const skillRes = await SkillResource.fetchById(auth, skillId);
  if (!skillRes) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill was not found.",
      },
    });
  }

  const { editorGroup } = skillRes;
  if (!editorGroup) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "The skill does not have an editors group.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const members = await editorGroup.getActiveMembers(auth);
      const memberUsers = members.map((m) => m.toJSON());

      return res.status(200).json({ editors: memberUsers });
    }

    case "PATCH": {
      if (!skillRes.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "User is not authorized to edit the skill editors list.",
          },
        });
      }

      const bodyValidation = PatchSkillEditorsRequestBodySchema.decode(
        req.body
      );
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

      const { addEditorIds = [], removeEditorIds = [] } = bodyValidation.right;

      const usersToAddResources = await UserResource.fetchByIds(addEditorIds);
      const usersToRemoveResources =
        await UserResource.fetchByIds(removeEditorIds);
      const usersToAdd = usersToAddResources.map((u) => u.toJSON());
      const usersToRemove = usersToRemoveResources.map((u) => u.toJSON());

      if (
        usersToAddResources.length !== addEditorIds.length ||
        usersToRemoveResources.length !== removeEditorIds.length
      ) {
        const foundAddIds = new Set(usersToAddResources.map((u) => u.sId));
        const missingAddIds = addEditorIds.filter((id) => !foundAddIds.has(id));
        const foundRemoveIds = new Set(
          usersToRemoveResources.map((u) => u.sId)
        );
        const missingRemoveIds = removeEditorIds.filter(
          (id) => !foundRemoveIds.has(id)
        );
        const missingIds = [...missingAddIds, ...missingRemoveIds];

        if (missingIds.length > 0) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "user_not_found",
              message: `Some users were not found: ${missingIds.join(", ")}`,
            },
          });
        }
      }

      const addRes = await editorGroup.addMembers(auth, usersToAdd);
      if (addRes.isErr()) {
        switch (addRes.error.code) {
          case "unauthorized":
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "workspace_auth_error",
                message:
                  "You are not authorized to add members to the skill editors group.",
              },
            });
          case "system_or_global_group":
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "workspace_auth_error",
                message:
                  "Users cannot be added to system or global groups for skills.",
              },
            });
          case "user_not_found":
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "user_not_found",
                message: "The user was not found in the workspace.",
              },
            });
          case "user_already_member":
            return apiError(req, res, {
              status_code: 409,
              api_error: {
                type: "invalid_request_error",
                message:
                  "The user is already a member of the skill editors group.",
              },
            });
          default:
            assertNever(addRes.error.code);
        }
      }

      const removeRes = await editorGroup.removeMembers(auth, usersToRemove);
      if (removeRes.isErr()) {
        switch (removeRes.error.code) {
          case "unauthorized":
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "workspace_auth_error",
                message:
                  "You are not authorized to remove members from the skill editors group.",
              },
            });
          case "system_or_global_group":
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "workspace_auth_error",
                message:
                  "Users cannot be removed from system or global groups for skills.",
              },
            });
          case "user_not_found":
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "user_not_found",
                message: "The user was not found in the workspace.",
              },
            });
          case "user_not_member":
            return apiError(req, res, {
              status_code: 409,
              api_error: {
                type: "invalid_request_error",
                message: "The user is not a member of the skill editors group.",
              },
            });
          default:
            assertNever(removeRes.error.code);
        }
      }

      const updatedMembers = await editorGroup.getActiveMembers(auth);

      return res.status(200).json({
        editors: updatedMembers.map((m) => m.toJSON()),
      });
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
