import type { PokeListGroups } from "@app/lib/api/poke/groups";
import { GroupResource } from "@app/lib/resources/group_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import groupId from "./[groupId]";

const ListGroupsQuerySchema = z.object({
  // When "true", each group also carries its pool cap (one extra batched
  // query). Accepted but not yet honored: the cap is still returned
  // unconditionally so front-end bundles that predate the flag keep working.
  // A follow-up makes the cap conditional on this flag, once the bundles
  // sending it are deployed everywhere.
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

    const groups = await GroupResource.listAllWorkspaceGroups(auth);
    const memberCounts = await GroupResource.getMemberCountsForGroups(
      auth,
      groups
    );
    const poolCaps = await GroupResource.getPoolCapAwuCreditsForGroups(
      auth,
      groups
    );

    return ctx.json({
      groups: groups.map((group) => ({
        ...group.toJSON(),
        memberCount: memberCounts.get(group.id) ?? 0,
        poolCapAwuCredits: poolCaps.get(group.id) ?? null,
      })),
    });
  }
);

app.route("/:groupId", groupId);

export default app;
