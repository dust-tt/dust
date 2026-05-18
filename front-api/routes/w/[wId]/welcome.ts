import { Hono } from "hono";

import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { EmailProviderType } from "@app/lib/utils/email_provider_detection";
import { detectEmailProvider } from "@app/lib/utils/email_provider_detection";

export type GetWelcomeResponseBody = {
  isFirstAdmin: boolean;
  emailProvider: EmailProviderType;
};

// Mounted at /api/w/:wId/welcome.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

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

  const body: GetWelcomeResponseBody = { isFirstAdmin, emailProvider };
  return c.json(body);
});

export default app;
