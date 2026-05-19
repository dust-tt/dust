import { Hono } from "hono";

import { MembershipResource } from "@app/lib/resources/membership_resource";

export type GetWorkspaceSeatsCountResponseBody = {
  seatsCount: number;
};

// Mounted at /api/w/:wId/seats/count.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return c.json(
      {
        error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `admins` for the current workspace can access this endpoint.",
        },
      },
      403
    );
  }

  const owner = auth.getNonNullableWorkspace();

  const seatsCount = await MembershipResource.countActiveSeatsInWorkspace(
    owner.sId
  );
  const body: GetWorkspaceSeatsCountResponseBody = { seatsCount };
  return c.json(body);
});

export default app;
