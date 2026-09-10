import type { GetWorkspaceGrantedSeatTypesResponseBody } from "@app/lib/api/workspace";
import { GroupResource } from "@app/lib/resources/group_resource";
import { removeNulls } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/granted-seat-types.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<GetWorkspaceGrantedSeatTypesResponseBody> => {
    const auth = ctx.get("auth");

    const groups = await GroupResource.listSeatGrantingGroupsForWorkspace(auth);

    const grantedSeatTypes = [
      ...new Set(removeNulls(groups.map((g) => g.grantedSeatType))),
    ];

    return ctx.json({ grantedSeatTypes });
  }
);

export default app;
