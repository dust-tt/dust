import { MembershipResource } from "@app/lib/resources/membership_resource";

import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type GetWorkspaceSeatsCountResponseBody = {
  seatsCount: number;
};

// Mounted at /api/w/:wId/seats/count.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();

  const seatsCount = await MembershipResource.countActiveSeatsInWorkspace(
    owner.sId
  );
  const body: GetWorkspaceSeatsCountResponseBody = { seatsCount };
  return c.json(body);
});

export default app;
