import type { GetProvisioningStatusResponseBody } from "@app/lib/api/workspace";
import {
  ADMIN_GROUP_NAME,
  GroupResource,
  MANAGER_GROUP_NAME,
} from "@app/lib/resources/group_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/provisioning-status.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetProvisioningStatusResponseBody> => {
  const auth = ctx.get("auth");

  const groups =
    await GroupResource.listRoleProvisioningGroupsForWorkspace(auth);

  return ctx.json({
    hasAdminGroup: groups.some((g) => g.name === ADMIN_GROUP_NAME),
    hasManagerGroup: groups.some((g) => g.name === MANAGER_GROUP_NAME),
  });
});

export default app;
