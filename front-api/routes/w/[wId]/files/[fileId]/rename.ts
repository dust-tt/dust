import { getFeatureFlags } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { FileType } from "@app/types/files";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type RenameFileResponseBody = {
  file: FileType;
};

const RenameRequestBodySchema = z.object({
  fileName: z.string().trim().min(1, "fileName must be a non-empty string"),
});

// Mounted at /api/w/:wId/files/:fileId/rename.
const app = workspaceApp();

app.patch(
  "/",
  validate("json", RenameRequestBodySchema),
  async (ctx): HandlerResult<RenameFileResponseBody> => {
    const auth = ctx.get("auth");
    const fileId = ctx.req.param("fileId") ?? "";

    const file = await FileResource.fetchById(auth, fileId);
    if (!file) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }

    if (file.useCase === "project_context") {
      const featureFlags = await getFeatureFlags(auth);
      if (!featureFlags.includes("projects")) {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Feature not supported",
          },
        });
      }
    }

    // Plan-mode files are agent-owned; users cannot rename them.
    if (file.useCaseMetadata?.isPlanFile) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "plan.md is managed by the agent and cannot be renamed directly.",
        },
      });
    }

    const space = file.useCaseMetadata?.spaceId
      ? await SpaceResource.fetchById(auth, file.useCaseMetadata.spaceId)
      : null;

    if (file.useCase === "project_context") {
      if (!space || !space.canWrite(auth)) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "You cannot edit files in that space.",
          },
        });
      }
      // biome-ignore lint/plugin/noDirectRoleCheck: conditional — only checked when file is not project_context
    } else if (!auth.isBuilder()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `builders` for the current workspace can modify files.",
        },
      });
    }

    const { fileName } = ctx.req.valid("json");
    await file.rename(fileName);

    return ctx.json({ file: file.toJSON(auth) });
  }
);

export default app;
