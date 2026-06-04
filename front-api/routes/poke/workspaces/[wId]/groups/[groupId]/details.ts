import { getGroupMembersWithWorkspaces } from "@app/lib/api/workspace";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { GroupType } from "@app/types/groups";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type PokeGetGroupDetails = {
  members: UserTypeWithWorkspaces[];
  group: GroupType;
};

const ParamsSchema = z.object({
  groupId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/groups/:groupId/details.
const app = pokeApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeGetGroupDetails> => {
    const auth = ctx.get("auth");
    const { groupId } = ctx.req.valid("param");

    const groupRes = await GroupResource.fetchById(auth, groupId);
    if (groupRes.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "group_not_found",
          message: "Group not found.",
        },
      });
    }

    const group = groupRes.value;
    const members = await getGroupMembersWithWorkspaces(auth, group);

    return ctx.json({
      members,
      group: group.toJSON(),
    });
  }
);

export default app;
