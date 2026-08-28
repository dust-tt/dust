import { GroupResource } from "@app/lib/resources/group_resource";
import type { GetKeyScopableGroupsResponseBody } from "@app/types/api/keys";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/keys/groups.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetKeyScopableGroupsResponseBody> => {
    const auth = ctx.get("auth");

    // A key can only be scoped to groups the caller is a member of, so we list
    // those rather than every workspace group.
    const groups = await GroupResource.listMemberGroups(auth);

    return ctx.json({
      groups: await GroupResource.toJSONWithMemberCounts(auth, groups),
    });
  }
);

export default app;
