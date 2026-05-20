import { getMembers } from "@app/lib/api/workspace";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { GroupType } from "@app/types/groups";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type PokeGetGroupDetails = {
  members: UserTypeWithWorkspaces[];
  group: GroupType;
};

// Mounted at /api/poke/workspaces/:wId/groups/:groupId/details.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<PokeGetGroupDetails> => {
  const auth = ctx.get("auth");
  const groupId = ctx.req.param("groupId");
  if (!groupId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid group ID.",
      },
    });
  }

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

  const groupMembers = await group.getActiveMembers(auth);
  const memberships = await getMembers(auth);

  const memberById = new Map(memberships.members.map((m) => [m.sId, m]));

  const userWithWorkspaces = groupMembers.flatMap((user) => {
    const member = memberById.get(user.sId);
    return member ? [member] : [];
  });

  return ctx.json({
    members: userWithWorkspaces,
    group: group.toJSON(),
  });
});

export default app;
