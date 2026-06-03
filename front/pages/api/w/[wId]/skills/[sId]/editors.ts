/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { LightUserType, UserType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const PatchSkillEditorsRequestBodySchema = z
  .object({
    addEditorIds: z.array(z.string()).optional(),
    removeEditorIds: z.array(z.string()).optional(),
  })
  .refine(
    (body) =>
      (body.addEditorIds instanceof Array && body.addEditorIds.length > 0) ||
      (body.removeEditorIds instanceof Array &&
        body.removeEditorIds.length > 0),
    {
      message:
        "Either addEditorIds or removeEditorIds must be provided and contain at least one ID.",
    }
  );

export type PatchSkillEditorsRequestBody = z.infer<
  typeof PatchSkillEditorsRequestBodySchema
>;

export interface SkillEditorsResponseBody {
  editors: UserType[];
}

export interface SkillEditorsLightResponseBody {
  editors: LightUserType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | SkillEditorsResponseBody
      | SkillEditorsLightResponseBody
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
      status_code: 400,
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

      // Non-admins get a response with sensitive fields (email, provider, lastLoginAt etc) stripped away.
      if (auth.isAdmin()) {
        return res.status(200).json({ editors: memberUsers });
      }

      return res.status(200).json({
        editors: memberUsers.map((m) => ({
          sId: m.sId,
          firstName: m.firstName,
          lastName: m.lastName,
          fullName: m.fullName,
          image: m.image,
        })),
      });
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

      const bodyValidation = PatchSkillEditorsRequestBodySchema.safeParse(
        req.body
      );
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { addEditorIds = [], removeEditorIds = [] } = bodyValidation.data;

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

      // Check authorization for modifying group members
      if (!editorGroup.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "workspace_auth_error",
            message:
              "You are not authorized to modify the skill editors group.",
          },
        });
      }

      const addRes = await editorGroup.dangerouslyAddMembers(auth, {
        users: usersToAdd,
      });
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
          case "group_requirements_not_met":
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "workspace_auth_error",
                message: "Only builders can be added to skill editors.",
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

      const removeRes = await editorGroup.dangerouslyRemoveMembers(auth, {
        users: usersToRemove,
      });
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
      const updatedEditors = updatedMembers.map((m) => m.toJSON());

      // Non-admins get a response with sensitive fields (email, provider, lastLoginAt etc) stripped away.
      if (auth.isAdmin()) {
        return res.status(200).json({ editors: updatedEditors });
      }

      return res.status(200).json({
        editors: updatedEditors.map((m) => ({
          sId: m.sId,
          firstName: m.firstName,
          lastName: m.lastName,
          fullName: m.fullName,
          image: m.image,
        })),
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
