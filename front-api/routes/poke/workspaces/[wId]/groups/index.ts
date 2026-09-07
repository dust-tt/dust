import type { PokeListGroups } from "@app/lib/api/poke/groups";
import { GroupResource } from "@app/lib/resources/group_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import groupId from "./[groupId]";

const ListGroupsQuerySchema = z.object({
  // When "true", each group also carries its pool cap (one extra batched
  // query). Omitted otherwise: only the pool usage view reads it.
  withPoolCaps: z.enum(["true", "false"]).optional(),
});

// Mounted at /api/poke/workspaces/:wId/groups.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", ListGroupsQuerySchema),
  async (ctx): HandlerResult<PokeListGroups> => {
    const auth = ctx.get("auth");
    const { withPoolCaps } = ctx.req.valid("query");

    const groups = await GroupResource.listAllWorkspaceGroups(auth);

    return ctx.json({
      groups: await GroupResource.toJSONWithMemberCounts(auth, groups, {
        withPoolCaps: withPoolCaps === "true",
      }),
    });
  }
);

app.route("/:groupId", groupId);

export default app;
