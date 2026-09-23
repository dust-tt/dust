import {
  findAddedEditorsWithoutSpaceAccess,
  resolveSkillEditorUsers,
} from "@app/lib/api/skills/editors_change";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
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
import { rejectArchivedSkill } from "@front-api/routes/w/[wId]/skills/guards";
import type { Context } from "hono";
import { z } from "zod";

export type { PatchSkillEditorsRequestBody, SkillEditorsResponseBody };

const ParamsSchema = z.object({
  sId: z.string(),
});

// Resolve :sId into a skill. Returns either the loaded resource or a Response
// describing the failure — keeps the validation prelude in one place per [API10].
async function loadSkill(
  ctx: Context,
  sId: string,
  {
    redactUnreadableForAdmin = false,
  }: {
    redactUnreadableForAdmin?: boolean;
  } = {}
): Promise<SkillResource | Response> {
  const auth = ctx.get("auth");

  const skill = await SkillResource.fetchById(auth, sId, {
    permissionFiltering:
      redactUnreadableForAdmin && auth.isAdmin()
        ? "redact_unreadable"
        : "strict",
  });
  if (!skill) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill was not found.",
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

  // Editors are not private: admins can list them for the skills they cannot read too, e.g. to
  // know whom to ask for access.
  const skill = await loadSkill(ctx, sId, { redactUnreadableForAdmin: true });
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

    const skillRes = await loadSkill(ctx, sId);
    if (skillRes instanceof Response) {
      return skillRes;
    }

    if (!auth.can("admin", skillRes)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "User is not authorized to edit the skill editors list.",
        },
      });
    }

    const archivedError = rejectArchivedSkill(ctx, skillRes);
    if (archivedError) {
      return archivedError;
    }

    const { addEditorIds = [], removeEditorIds = [] } = ctx.req.valid("json");

    // TODO(achilleburah): adopt validateSkillEditorsChange here so this route follows the same
    // rules as the suggestion path. Today removing an editor who left the workspace is accepted
    // there and rejected here by dangerouslyRemoveMembers, which breaks the
    // same-rules-as-manual-editors-route contract.
    const { missingIds, usersToAdd, usersToRemove } =
      await resolveSkillEditorUsers({
        addUserIds: addEditorIds,
        removeUserIds: removeEditorIds,
      });
    if (missingIds.length > 0) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found",
          message: `Some users were not found: ${missingIds.join(", ")}`,
        },
      });
    }

    const editorsAccessError = await findAddedEditorsWithoutSpaceAccess(
      auth,
      skillRes,
      usersToAdd
    );
    if (editorsAccessError) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: editorsAccessError,
        },
      });
    }

    // Editors are per-user grants on the skill (`grantToUser`), not group memberships.
    const addRes = await skillRes.addEditors(auth, usersToAdd);
    if (addRes.isErr()) {
      switch (addRes.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "workspace_auth_error",
              message: "You are not authorized to add skill editors.",
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
        default:
          assertNever(addRes.error.code);
      }
    }

    const removeRes = await skillRes.removeEditors(auth, usersToRemove);
    if (removeRes.isErr()) {
      switch (removeRes.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "workspace_auth_error",
              message: "You are not authorized to remove skill editors.",
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
