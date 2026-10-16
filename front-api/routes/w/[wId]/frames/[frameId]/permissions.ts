import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
import { FileResource } from "@app/lib/resources/file_resource";
import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import type { GetFramePermissionsResponseBody } from "@app/types/api/frame_permissions";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  frameId: z.string(),
});

// Mounted at /api/w/:wId/frames/:frameId/permissions.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { frameId } = ctx.req.valid("param");
  const frame = await FileResource.fetchById(auth, frameId);

  if (!frame?.isFrameV2) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "Frame not found." },
    });
  }

  const canWriteFrameSource = await canWriteFrameV2Source(auth, frame);
  const livePublicationId = frame.useCaseMetadata?.activePublicationId ?? null;
  const [hasFunctions, livePublication] = await Promise.all([
    frame.hasFrameFunctions({
      publication: canWriteFrameSource ? "latest" : "live",
    }),
    livePublicationId
      ? FramePublicationResource.fetchForFramePublication(
          auth,
          frame,
          livePublicationId
        )
      : null,
  ]);

  return ctx.json<GetFramePermissionsResponseBody>({
    canWriteFrameSource,
    // Temporary alias for mobile / open clients still decoding the old field name.
    isFrameAuthor: canWriteFrameSource,
    packageRoot: frame.getFrameV2SourceDirectoryPath(auth),
    hasFunctions,
    livePublicationId,
    livePublishedAt: livePublication?.createdAt.getTime() ?? null,
    draftPublicationId: canWriteFrameSource
      ? (frame.pendingDraftPublicationId ?? null)
      : null,
  });
});

export default app;
