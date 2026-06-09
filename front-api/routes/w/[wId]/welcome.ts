import type { GetWelcomeResponseBody } from "@app/lib/api/workspace";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { detectEmailProvider } from "@app/lib/utils/email_provider_detection";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/welcome.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetWelcomeResponseBody> => {
  const auth = ctx.get("auth");

  const owner = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();
  const isAdmin = auth.isAdmin();

  const { total: membersTotal } =
    await MembershipResource.getMembershipsForWorkspace({
      workspace: owner,
    });
  const isFirstAdmin = isAdmin && membersTotal === 1;

  const userJson = user.toJSON();
  const emailProvider = await detectEmailProvider(
    userJson.email,
    `user-${userJson.sId}`
  );

  return ctx.json({ isFirstAdmin, emailProvider });
});

export default app;
