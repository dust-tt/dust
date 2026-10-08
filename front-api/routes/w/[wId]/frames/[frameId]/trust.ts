import {
  getFrameTrustState,
  grantFrameTrust,
} from "@app/lib/api/frames/frame_trust";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { GetFrameTrustResponseBody } from "@app/types/api/frame_trust";
import { PostFrameTrustRequestBodySchema } from "@app/types/api/frame_trust";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  frameId: z.string(),
});

async function fetchUsableFrame(
  auth: Authenticator,
  frameId: string
): Promise<FileResource | null> {
  const frame = await FileResource.fetchById(auth, frameId);
  if (!frame?.isFrameV2 || !(await frame.canCurrentUserUseFrame(auth))) {
    return null;
  }

  return frame;
}

// Mounted at /api/w/:wId/frames/:frameId/trust.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { frameId } = ctx.req.valid("param");

  const frame = await fetchUsableFrame(auth, frameId);
  if (!frame) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "Frame not found." },
    });
  }

  return ctx.json<GetFrameTrustResponseBody>({
    trust: await getFrameTrustState(auth, frame),
  });
});

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostFrameTrustRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { frameId } = ctx.req.valid("param");
    const { publisherId } = ctx.req.valid("json");

    const frame = await fetchUsableFrame(auth, frameId);
    if (!frame) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "Frame not found." },
      });
    }

    const grantResult = await grantFrameTrust(auth, {
      frame,
      expectedPublisherId: publisherId,
    });
    if (grantResult.isErr()) {
      const { error } = grantResult;
      switch (error) {
        case "nothing_to_trust":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "frame_trust_not_applicable",
              message: "This Frame has no publisher to trust.",
            },
          });
        case "publisher_changed":
          return apiError(ctx, {
            status_code: 409,
            api_error: {
              type: "frame_publisher_changed",
              message:
                "Someone else published this Frame since you opened it. Reload it to see who.",
            },
          });
        default:
          return assertNever(error);
      }
    }

    return ctx.json<GetFrameTrustResponseBody>({
      trust: await getFrameTrustState(auth, frame),
    });
  }
);

export default app;
