import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  fileId: z.string(),
});

// Mounted at /api/w/:wId/files/:fileId/signed-url.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { fileId } = ctx.req.valid("param");

  const fileResource = await FileResource.fetchById(auth, fileId);
  if (!fileResource) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const spaceId = fileResource.useCaseMetadata?.spaceId;
  if (!spaceId) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space || !space.isMember(auth)) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const signedUrl = await fileResource.getSignedUrlForInlineView(auth);
  return ctx.json({ signedUrl });
});

export default app;
