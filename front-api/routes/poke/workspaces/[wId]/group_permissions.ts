import type { PokeListGroupPermissions } from "@app/lib/api/poke/group_permissions";
import {
  getPokeGroupPermissionsForGroup,
  getPokeGroupPermissionsForResource,
} from "@app/lib/api/poke/group_permissions";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GROUP_PERMISSION_RESOURCE_TYPES } from "@app/types/group_permissions";
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
    resourceType: z.enum([...GROUP_PERMISSION_RESOURCE_TYPES]),
    resourceId: z.coerce.number().int(),
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
      const groupRes = await GroupResource.fetchById(auth, query.groupId);
      if (groupRes.isErr()) {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "group_not_found",
            message: "Group not found.",
          },
        });
      }

      return ctx.json({
        groupPermissions: await getPokeGroupPermissionsForGroup(
          auth,
          groupRes.value
        ),
      });
    }

    return ctx.json({
      groupPermissions: await getPokeGroupPermissionsForResource(auth, {
        resourceType: query.resourceType,
        resourceId: query.resourceId,
      }),
    });
  }
);

export default app;
