import type { GroupResource } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

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

export interface GetSkillEditorsResponseBody {
  editors: UserType[];
}

export interface PatchSkillEditorsResponseBody {
  editors: UserType[];
}

// Resolve :sId into a skill + its editor group. Returns either the loaded
// resources or a Response describing the failure — keeps the validation
// prelude in one place per [API10].
async function loadSkillAndEditorGroup(
  ctx: Context
): Promise<{ skill: SkillResource; editorGroup: GroupResource } | Response> {
  const auth = ctx.get("auth");
  const sId = ctx.req.param("sId");

  if (!isString(sId)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill id.",
      },
    });
  }

  const skill = await SkillResource.fetchById(auth, sId);
  if (!skill) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill was not found.",
      },
    });
  }

  const { editorGroup } = skill;
  if (!editorGroup) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The skill does not have an editors group.",
      },
    });
  }

  return { skill, editorGroup };
}

// Mounted at /api/w/:wId/skills/:sId/editors.
const app = workspaceApp();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  const loaded = await loadSkillAndEditorGroup(ctx);
  if (loaded instanceof Response) {
    return loaded;
  }
  const { editorGroup } = loaded;

  const members = await editorGroup.getActiveMembers(auth);
  const memberUsers = members.map((m) => m.toJSON());

  // biome-ignore lint/plugin/noDirectRoleCheck: conditional response — non-admins get a light response, not a 403
  if (auth.isAdmin()) {
    return ctx.json({ editors: memberUsers });
  }

  return ctx.json({
    editors: memberUsers.map((m) => ({
      sId: m.sId,
      firstName: m.firstName,
      lastName: m.lastName,
      fullName: m.fullName,
      image: m.image,
    })),
  });
});

app.patch(
  "/",
  validate("json", PatchSkillEditorsRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    const loaded = await loadSkillAndEditorGroup(ctx);
    if (loaded instanceof Response) {
      return loaded;
    }
    const { skill: skillRes, editorGroup } = loaded;

    if (!skillRes.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "User is not authorized to edit the skill editors list.",
        },
      });
    }

    const { addEditorIds = [], removeEditorIds = [] } = ctx.req.valid("json");

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
      const foundRemoveIds = new Set(usersToRemoveResources.map((u) => u.sId));
      const missingRemoveIds = removeEditorIds.filter(
        (id) => !foundRemoveIds.has(id)
      );
      const missingIds = [...missingAddIds, ...missingRemoveIds];

      if (missingIds.length > 0) {
        return apiError(ctx, {
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
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "workspace_auth_error",
          message: "You are not authorized to modify the skill editors group.",
        },
      });
    }

    const addRes = await editorGroup.dangerouslyAddMembers(auth, {
      users: usersToAdd,
    });
    if (addRes.isErr()) {
      switch (addRes.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "workspace_auth_error",
              message:
                "You are not authorized to add members to the skill editors group.",
            },
          });
        case "group_requirements_not_met":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: "Only builders can be added to skill editors.",
            },
          });
        case "system_or_global_group":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message:
                "Users cannot be added to system or global groups for skills.",
            },
          });
        case "user_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "user_not_found",
              message: "The user was not found in the workspace.",
            },
          });
        case "user_already_member":
          return apiError(ctx, {
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
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "workspace_auth_error",
              message:
                "You are not authorized to remove members from the skill editors group.",
            },
          });
        case "system_or_global_group":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message:
                "Users cannot be removed from system or global groups for skills.",
            },
          });
        case "user_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "user_not_found",
              message: "The user was not found in the workspace.",
            },
          });
        case "user_not_member":
          return apiError(ctx, {
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

    // biome-ignore lint/plugin/noDirectRoleCheck: conditional response — non-admins get a light response, not a 403
    if (auth.isAdmin()) {
      return ctx.json({ editors: updatedEditors });
    }

    return ctx.json({
      editors: updatedEditors.map((m) => ({
        sId: m.sId,
        firstName: m.firstName,
        lastName: m.lastName,
        fullName: m.fullName,
        image: m.image,
      })),
    });
  }
);

export default app;
