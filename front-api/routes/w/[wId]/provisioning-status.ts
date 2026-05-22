import {
  ADMIN_GROUP_NAME,
  BUILDER_GROUP_NAME,
  GroupResource,
} from "@app/lib/resources/group_resource";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";

export type GetProvisioningStatusResponseBody = {
  hasAdminGroup: boolean;
  hasBuilderGroup: boolean;
};

// Mounted at /api/w/:wId/provisioning-status.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetProvisioningStatusResponseBody> => {
  const auth = ctx.get("auth");

  const groups =
    await GroupResource.listRoleProvisioningGroupsForWorkspace(auth);

  return ctx.json({
    hasAdminGroup: groups.some((g) => g.name === ADMIN_GROUP_NAME),
    hasBuilderGroup: groups.some((g) => g.name === BUILDER_GROUP_NAME),
  });
});

export default app;
