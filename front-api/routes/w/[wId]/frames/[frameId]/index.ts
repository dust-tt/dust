import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
import { renameFrameV2 } from "@app/lib/api/frames/rename_source";
import { FileResource } from "@app/lib/resources/file_resource";
import type { FileType } from "@app/types/files";
import { frameRenameErrorStatus } from "@front-api/lib/api/frame_source_errors";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import functions from "./functions";
import invocations from "./invocations";
import permissions from "./permissions";
import source from "./source";

export type RenameFrameResponseBody = {
  frame: FileType;
};

const ParamsSchema = z.object({
  frameId: z.string(),
});

const RenameRequestBodySchema = z.object({
  name: z.string().trim().min(1, "name must be a non-empty string"),
});

const app = workspaceApp();

app.route("/functions", functions);
app.route("/invocations", invocations);
app.route("/permissions", permissions);
app.route("/source", source);

/** @ignoreswagger */
app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", RenameRequestBodySchema),
  async (ctx): HandlerResult<RenameFrameResponseBody> => {
    const auth = ctx.get("auth");
    const { frameId } = ctx.req.valid("param");

    const frame = await FileResource.fetchById(auth, frameId);
    if (!frame?.isFrameV2) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "Frame not found." },
      });
    }

    if (!(await canWriteFrameV2Source(auth, frame))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You cannot rename this Frame.",
        },
      });
    }

    const { name } = ctx.req.valid("json");
    const renamed = await renameFrameV2(auth, { frame, newName: name });
    if (renamed.isErr()) {
      const status = frameRenameErrorStatus(renamed.error);
      return apiError(ctx, {
        status_code: status,
        api_error: {
          type:
            status === 500 ? "internal_server_error" : "invalid_request_error",
          message: renamed.error.message,
        },
      });
    }

    return ctx.json({ frame: renamed.value.frame.toJSON(auth) }, 200);
  }
);

export default app;
