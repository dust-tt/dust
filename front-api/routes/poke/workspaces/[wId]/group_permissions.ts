import type { PokeListGroupPermissions } from "@app/lib/api/poke/group_permissions";
import {
  getPokeGroupPermissionsForGroup,
  getPokeGroupPermissionsForResource,
  POKE_GROUP_PERMISSION_RESOURCE_TYPES,
} from "@app/lib/api/poke/group_permissions";
import { fetchPokeGroupById } from "@app/lib/api/poke/groups";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

// Either mode: grants held by a group, or grants that apply to a resource instance.
const QuerySchema = z.union([
  z.object({
    groupId: z.string(),
  }),
  z.object({
    resourceType: z.enum([...POKE_GROUP_PERMISSION_RESOURCE_TYPES]),
    resourceId: z.string(),
  }),
]);

// Mounted at /api/poke/workspaces/:wId/group_permissions.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", QuerySchema),
  async (ctx): HandlerResult<PokeListGroupPermissions> => {
    const auth = ctx.get("auth");
    const query = ctx.req.valid("query");

    if ("groupId" in query) {
      const group = await fetchPokeGroupById(auth, query.groupId);
      if (!group) {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "group_not_found",
            message: "Group not found.",
          },
        });
      }

      return ctx.json({
        groupPermissions: await getPokeGroupPermissionsForGroup(auth, group),
      });
    }

    const { resourceType, resourceId } = query;
    switch (resourceType) {
      case "space": {
        const space = await SpaceResource.fetchById(auth, resourceId);
        if (!space) {
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "space_not_found",
              message: "Space not found.",
            },
          });
        }

        return ctx.json({
          groupPermissions: await getPokeGroupPermissionsForResource(auth, {
            resourceType: "space",
            resourceId: space.id,
          }),
        });
      }

      case "skill": {
        const skill = await SkillResource.fetchById(auth, resourceId);
        if (!skill) {
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "skill_not_found",
              message: "Skill not found.",
            },
          });
        }

        return ctx.json({
          groupPermissions: await getPokeGroupPermissionsForResource(auth, {
            resourceType: "skill",
            resourceId: skill.id,
          }),
        });
      }

      default:
        return assertNever(resourceType);
    }
  }
);

export default app;
