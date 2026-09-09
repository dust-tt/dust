import type { GetProvisioningStatusResponseBody } from "@app/lib/api/workspace";
import { GroupResource } from "@app/lib/resources/group_resource";
import { removeNulls } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/provisioning-status.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetProvisioningStatusResponseBody> => {
  const auth = ctx.get("auth");

  const groups = await GroupResource.listRoleGrantingGroupsForWorkspace(auth);

  const grantedRoles = [
    ...new Set(removeNulls(groups.map((g) => g.grantedRole))),
  ];

  return ctx.json({ grantedRoles });
});

export default app;
