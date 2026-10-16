import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
import { FileResource } from "@app/lib/resources/file_resource";
import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import type { GetFramePermissionsResponseBody } from "@app/types/api/frame_permissions";
import { FramePublicationTargetSchema } from "@app/types/api/frame_publication";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  frameId: z.string(),
});

const QuerySchema = z.object({
  publication: FramePublicationTargetSchema.optional(),
});

// Mounted at /api/w/:wId/frames/:frameId/permissions.
const app = workspaceApp();

/** @ignoreswagger */
/**
 * @cc [owner:davidebbo,label:product;security] frame-permissions-functions-follow-the-served-publication
 * `hasFunctions` MUST describe the latest publication only when the request asks for
 * `publication=latest` AND the caller passes `canWriteFrameV2Source`; otherwise it describes the
 * live one, matching what `frame-view-serves-latest-only-when-asked` serves the same caller.
 * `draftPublicationId` MUST be reported to every writer whatever `publication` is, and to no one
 * else.
 */
app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", QuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { frameId } = ctx.req.valid("param");
    const { publication: requestedPublication = "live" } =
      ctx.req.valid("query");
    const frame = await FileResource.fetchById(auth, frameId);

    if (!frame?.isFrameV2) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "Frame not found." },
      });
    }

    const canWriteFrameSource = await canWriteFrameV2Source(auth, frame);
    const livePublicationId =
      frame.useCaseMetadata?.activePublicationId ?? null;
    const [hasFunctions, livePublication] = await Promise.all([
      frame.hasFrameFunctions({
        publication:
          requestedPublication === "latest" && canWriteFrameSource
            ? "latest"
            : "live",
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
  }
);

export default app;
