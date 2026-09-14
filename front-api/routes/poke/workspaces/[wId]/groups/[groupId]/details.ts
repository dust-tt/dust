import type { PokeGetGroupDetails } from "@app/lib/api/poke/groups";
import { fetchPokeGroupById } from "@app/lib/api/poke/groups";
import { getGroupMembersWithWorkspaces } from "@app/lib/api/workspace";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  groupId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/groups/:groupId/details.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeGetGroupDetails> => {
    const auth = ctx.get("auth");
    const { groupId } = ctx.req.valid("param");

    const group = await fetchPokeGroupById(auth, groupId);
    if (!group) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "group_not_found",
          message: "Group not found.",
        },
      });
    }

    const members = await getGroupMembersWithWorkspaces(auth, group);

    return ctx.json({
      members,
      group: { ...group.toJSON(), memberCount: members.length },
    });
  }
);

export default app;
