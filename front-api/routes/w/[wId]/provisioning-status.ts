import { Hono } from "hono";

import {
  ADMIN_GROUP_NAME,
  BUILDER_GROUP_NAME,
  GroupResource,
} from "@app/lib/resources/group_resource";

export type GetProvisioningStatusResponseBody = {
  hasAdminGroup: boolean;
  hasBuilderGroup: boolean;
};

// Mounted at /api/w/:wId/provisioning-status.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  const groups =
    await GroupResource.listRoleProvisioningGroupsForWorkspace(auth);

  const body: GetProvisioningStatusResponseBody = {
    hasAdminGroup: groups.some((g) => g.name === ADMIN_GROUP_NAME),
    hasBuilderGroup: groups.some((g) => g.name === BUILDER_GROUP_NAME),
  };
  return c.json(body);
});

export default app;
