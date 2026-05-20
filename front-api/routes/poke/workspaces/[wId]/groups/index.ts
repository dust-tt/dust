import { GroupResource } from "@app/lib/resources/group_resource";
import type { GroupType } from "@app/types/groups";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

import groupId from "./[groupId]";

export type PokeListGroups = {
  groups: GroupType[];
};

// Mounted at /api/poke/workspaces/:wId/groups.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<PokeListGroups> => {
  const auth = ctx.get("auth");

  const groups = await GroupResource.listAllWorkspaceGroups(auth, {
    groupKinds: ["global", "regular", "space_editors", "provisioned"],
  });

  return ctx.json({ groups: groups.map((g) => g.toJSON()) });
});

app.route("/:groupId", groupId);

export default app;
