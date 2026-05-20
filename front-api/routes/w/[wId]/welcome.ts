import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { EmailProviderType } from "@app/lib/utils/email_provider_detection";
import { detectEmailProvider } from "@app/lib/utils/email_provider_detection";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type GetWelcomeResponseBody = {
  isFirstAdmin: boolean;
  emailProvider: EmailProviderType;
};

// Mounted at /api/w/:wId/welcome.
const app = new Hono();

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
