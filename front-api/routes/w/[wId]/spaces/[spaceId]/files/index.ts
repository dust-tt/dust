import { listGCSMountFiles } from "@app/lib/api/files/gcs_mount/files";
import { spaceResource } from "@front-api/middleware/space_resource";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

import rel from "./[...rel]";

// Mounted under /api/w/:wId/spaces/:spaceId/files.
const app = new Hono();

app.get("/", spaceResource({ requireCanRead: true }), async (c) => {
  const auth = c.get("auth");
  const space = c.get("space");

  if (!space.isProject()) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Files are only available for project spaces.",
      },
    });
  }

  const files = await listGCSMountFiles(auth, {
    useCase: "project",
    projectId: space.sId,
  });

  return c.json({ files });
});

// Catch-all wildcard for /files/<...rel>. Registered AFTER `/` to avoid
// swallowing requests to the bare /files endpoint.
app.route("/", rel);

export default app;
