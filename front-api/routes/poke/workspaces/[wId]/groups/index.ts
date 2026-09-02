import type { PokeListGroups } from "@app/lib/api/poke/groups";
import { GroupResource } from "@app/lib/resources/group_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import groupId from "./[groupId]";

// Mounted at /api/poke/workspaces/:wId/groups.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeListGroups> => {
  const auth = ctx.get("auth");

  const groups = await GroupResource.listAllWorkspaceGroups(auth);
  const memberCounts = await GroupResource.getMemberCountsForGroups(
    auth,
    groups
  );

  return ctx.json({
    groups: groups.map((group) => ({
      ...group.toJSON(),
      memberCount: memberCounts.get(group.id) ?? 0,
    })),
  });
});

app.route("/:groupId", groupId);

export default app;
