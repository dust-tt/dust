import { isGCSMountDirectoryAlreadyExistsError } from "@app/lib/api/files/gcs_mount/errors";
import { listGCSMountFiles } from "@app/lib/api/files/gcs_mount/files";
import { createProjectFolder } from "@app/lib/api/projects/context";
import { PostPodFolderRequestBodySchema } from "@app/lib/api/projects/pod_mount_schemas";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { withSpace } from "@front-api/middleware/with_space";
import { Hono } from "hono";

import rel from "./[...rel]";

// Mounted under /api/w/:wId/spaces/:spaceId/files.
const app = new Hono();

app.get("/", withSpace({ requireCanRead: true }), async (ctx) => {
  const auth = ctx.get("auth");
  const space = ctx.get("space");

  if (!space.isProject()) {
    return apiError(ctx, {
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

  return ctx.json({ files });
});

app.post(
  "/",
  withSpace({ requireCanRead: true }),
  validate("json", PostPodFolderRequestBodySchema),
  async (c) => {
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

    const { folderName, parentRelativePath } = c.req.valid("json");

    const createResult = await createProjectFolder(auth, {
      space,
      folderName,
      parentRelativePath,
    });
    if (createResult.isErr()) {
      return apiError(c, {
        status_code: isGCSMountDirectoryAlreadyExistsError(createResult.error)
          ? 409
          : 400,
        api_error: {
          type: "invalid_request_error",
          message: createResult.error.message,
        },
      });
    }

    return c.json({ folder: createResult.value }, 201);
  }
);

// Catch-all wildcard for /files/<...rel>. Registered AFTER `/` to avoid
// swallowing requests to the bare /files endpoint.
app.route("/", rel);

export default app;
