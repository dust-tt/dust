import { moveProjectContextFile } from "@app/lib/api/projects/context";
import { MovePodContextFileRequestBodySchema } from "@app/lib/api/projects/pod_mount_schemas";
import { FileResource } from "@app/lib/resources/file_resource";
import { spaceResource } from "@front-api/middleware/space_resource";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

// Mounted under /api/w/:wId/spaces/:spaceId/project_context/files/:fileId/move.
const app = new Hono();

app.post(
  "/",
  spaceResource({ requireCanRead: true }),
  validate("json", MovePodContextFileRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const fileId = c.req.param("fileId") ?? "";

    if (!space.isProject()) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Only project spaces support project context file moves.",
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

    const file = await FileResource.fetchById(auth, fileId);
    if (!file) {
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "File not found.",
        },
      });
    }

    const { parentRelativePath } = c.req.valid("json");

    const moveResult = await moveProjectContextFile(auth, {
      space,
      file,
      parentRelativePath,
    });
    if (moveResult.isErr()) {
      const error = moveResult.error;
      const statusCode =
        "code" in error && error.code === "invalid_request_error" ? 400 : 500;
      return apiError(c, {
        status_code: statusCode,
        api_error: {
          type:
            statusCode === 400
              ? "invalid_request_error"
              : "internal_server_error",
          message: error.message,
        },
      });
    }

    return c.json({});
  }
);

export default app;
