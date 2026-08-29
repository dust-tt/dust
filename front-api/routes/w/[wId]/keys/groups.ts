import { listKeyScopableGroups } from "@app/lib/api/keys/scopable_groups";
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

    // The groups the caller may scope a key to: their member groups, excluding
    // pod-related groups (keys scope to regular spaces only).
    const groups = await listKeyScopableGroups(auth);

    return ctx.json({
      groups: await GroupResource.toJSONWithMemberCounts(auth, groups),
    });
  }
);

export default app;
