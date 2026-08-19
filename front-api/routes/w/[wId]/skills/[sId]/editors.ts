import { findSkillEditorsWithoutSpaceAccess } from "@app/lib/api/skills/space_requirements";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  PatchSkillEditorsRequestBody,
  SkillEditorsResponseBody,
} from "@app/types/api/skills/editors";
import { PatchSkillEditorsRequestBodySchema } from "@app/types/api/skills/editors";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { toLightUser } from "@app/types/user";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

export type { PatchSkillEditorsRequestBody, SkillEditorsResponseBody };

const ParamsSchema = z.object({
  sId: z.string(),
});

// Resolve :sId into a skill + its editor group. Returns either the loaded
// resources or a Response describing the failure — keeps the validation
// prelude in one place per [API10].
async function loadSkillAndEditorGroup(
  ctx: Context,
  sId: string
): Promise<SkillResource | Response> {
  const auth = ctx.get("auth");

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

  return skill;
}

// Mounted at /api/w/:wId/skills/:sId/editors.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { sId } = ctx.req.valid("param");

  const skill = await loadSkillAndEditorGroup(ctx, sId);
  if (skill instanceof Response) {
    return skill;
  }

  const members = (await skill.listEditors(auth)) ?? [];
  const memberUsers = members.map((m) => m.toJSON());

  // biome-ignore lint/plugin/noDirectRoleCheck: non-admins receive only minimal essential user data (LightUserType)
  if (auth.isAdmin()) {
    return ctx.json({ editors: memberUsers });
  }

  return ctx.json({
    editors: memberUsers.map(toLightUser),
  });
});

app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchSkillEditorsRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { sId } = ctx.req.valid("param");

    const skillRes = await loadSkillAndEditorGroup(ctx, sId);
    if (skillRes instanceof Response) {
      return skillRes;
    }

    if (!skillRes.canAdministrate(auth)) {
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

    // Only the editors being added need checking: the ones already there were validated when they
    // were added or when the skill's spaces last changed.
    const requestedSpaces = await SpaceResource.fetchByModelIds(auth, [
      ...skillRes.requestedSpaceIds,
    ]);
    const editorsAccessError = await findSkillEditorsWithoutSpaceAccess(auth, {
      editors: usersToAddResources,
      requestedSpaces,
    });
    if (editorsAccessError) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: editorsAccessError,
        },
      });
    }

    // Through the resource: it keeps the per-user grants in sync with the group membership.
    const addRes = await skillRes.addEditors(auth, usersToAddResources);
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

    const removeRes = await skillRes.removeEditors(
      auth,
      usersToRemoveResources
    );
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

    const updatedMembers = (await skillRes.listEditors(auth)) ?? [];
    const updatedEditors = updatedMembers.map((m) => m.toJSON());

    // biome-ignore lint/plugin/noDirectRoleCheck: non-admins receive only minimal essential user data (LightUserType)
    if (auth.isAdmin()) {
      return ctx.json({ editors: updatedEditors });
    }

    return ctx.json({
      editors: updatedEditors.map(toLightUser),
    });
  }
);

export default app;
