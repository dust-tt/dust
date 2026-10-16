import { FileResource } from "@app/lib/resources/file_resource";
import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import { FrameToolAuthorizationResource } from "@app/lib/resources/frame_tool_authorization_resource";
import type { PostFrameToolAuthorizationResponseBody } from "@app/types/api/frame_permissions";
import { FrameToolCallPairSchema } from "@app/types/api/frame_publication";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  frameId: z.string(),
});

const BodySchema = z.object({
  // Client must echo the requiredTools it consented to; we only persist when they
  // match the active publication so a stale consent UI cannot under-authorize.
  authorizedTools: z.array(FrameToolCallPairSchema),
});

// Mounted at /api/w/:wId/frames/:frameId/tool-authorizations.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", BodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const user = auth.user();
    if (!user) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message: "Authentication required.",
        },
      });
    }

    const { frameId } = ctx.req.valid("param");
    const { authorizedTools } = ctx.req.valid("json");
    const frame = await FileResource.fetchById(auth, frameId);

    if (!frame?.isFrameV2) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "Frame not found." },
      });
    }

    const activePublication =
      await FramePublicationResource.fetchActiveForFrame(auth, frame);
    if (!activePublication) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "This Frame has no active publication.",
        },
      });
    }

    const required = [...activePublication.requiredTools]
      .map(([server, tool]) => `${server}\0${tool}`)
      .sort()
      .join("|");
    const submitted = [...authorizedTools]
      .map(([server, tool]) => `${server}\0${tool}`)
      .sort()
      .join("|");
    if (required !== submitted) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "authorizedTools must match the active publication's requiredTools.",
        },
      });
    }

    const authorization =
      await FrameToolAuthorizationResource.upsertForUserAndFrame(auth, {
        frame,
        authorizedTools: activePublication.requiredTools,
      });

    return ctx.json<PostFrameToolAuthorizationResponseBody>({
      authorizedTools: authorization.authorizedTools,
    });
  }
);

export default app;
