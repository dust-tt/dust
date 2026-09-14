import type { GetWorkspaceGrantedSeatTypesResponseBody } from "@app/lib/api/workspace";
import { hasFeatureFlag } from "@app/lib/auth";
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

    // When the feature is off, report no group-managed seats so the members UI
    // does not lock seat editing for a disabled workspace.
    if (!(await hasFeatureFlag(auth, "group_seat_provisioning"))) {
      return ctx.json({ grantedSeatTypes: [] });
    }

    const groups = await GroupResource.listSeatGrantingGroupsForWorkspace(auth);

    const grantedSeatTypes = [
      ...new Set(removeNulls(groups.map((g) => g.grantedSeatType))),
    ];

    return ctx.json({ grantedSeatTypes });
  }
);

export default app;
