import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import { listGCSMountFiles } from "@app/lib/api/files/gcs_mount/files";
import { createProjectFolder } from "@app/lib/api/projects/context";
import { isString } from "@app/types/shared/utils/general";

import { spaceResource } from "@front-api/middleware/space_resource";

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

app.post("/", spaceResource({ requireCanRead: true }), async (c) => {
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

  if (!space.canWrite(auth)) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "You do not have write access to this project.",
      },
    });
  }

  const body = await c.req.json().catch(() => ({}));
  const { folderName, parentRelativePath } = body ?? {};
  if (!isString(folderName)) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "folderName is required and must be a non-empty string without path separators.",
      },
    });
  }

  if (parentRelativePath !== undefined && !isString(parentRelativePath)) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "parentRelativePath must be a string when provided.",
      },
    });
  }

  const createResult = await createProjectFolder(auth, {
    space,
    folderName,
    parentRelativePath,
  });
  if (createResult.isErr()) {
    const message = createResult.error.message;
    const status_code = message === "Folder already exists." ? 409 : 400;
    return apiError(c, {
      status_code,
      api_error: {
        type: "invalid_request_error",
        message,
      },
    });
  }

  return c.json({ folder: createResult.value }, 201);
});

// Catch-all wildcard for /files/<...rel>. Registered AFTER `/` to avoid
// swallowing requests to the bare /files endpoint.
app.route("/", rel);

export default app;
