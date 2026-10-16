import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
import { authorizedToolsCoverRequired } from "@app/lib/api/frames/tool_authorization";
import { FileResource } from "@app/lib/resources/file_resource";
import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import { FrameToolAuthorizationResource } from "@app/lib/resources/frame_tool_authorization_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { getFrameV2NameFromManifestPath } from "@app/types/api/frame_manifest";
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

  const [canWriteFrameSource, hasFunctions, activePublication, authorization] =
    await Promise.all([
      canWriteFrameV2Source(auth, frame),
      frame.hasActiveFrameFunctions(),
      FramePublicationResource.fetchActiveForFrame(auth, frame),
      FrameToolAuthorizationResource.fetchForUserAndFrame(auth, frame),
    ]);

  const packageRoot = frame.getFrameV2SourceDirectoryPath(auth);
  const frameName =
    (frame.mountFilePath
      ? getFrameV2NameFromManifestPath(frame.mountFilePath)
      : null) ??
    packageRoot?.split("/").pop() ??
    null;

  const publisherUserId = activePublication?.publishedByUserId ?? null;
  const [publisher] = publisherUserId
    ? await UserResource.fetchByModelIds([publisherUserId])
    : [];
  const lastPublisherName = publisher?.fullName() || null;

  const requiredTools = activePublication?.requiredTools ?? [];
  const authorizedTools = authorization?.authorizedTools ?? [];
  const user = auth.user();
  const isLastPublisher = Boolean(
    user && publisherUserId !== null && publisherUserId === user.id
  );
  const hasAuthorizedRequiredTools =
    requiredTools.length === 0 ||
    isLastPublisher ||
    authorizedToolsCoverRequired(authorizedTools, requiredTools);

  return ctx.json<GetFramePermissionsResponseBody>({
    canWriteFrameSource,
    // Temporary alias for mobile / open clients still decoding the old field name.
    isFrameAuthor: canWriteFrameSource,
    packageRoot,
    frameName,
    hasFunctions,
    requiredTools,
    authorizedTools,
    isLastPublisher,
    lastPublisherName,
    hasAuthorizedRequiredTools,
  });
});

export default app;
