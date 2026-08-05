/** @ignoreswagger */

import { hasFeatureFlag } from "@app/lib/auth";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type {
  PostSandboxFunctionInvocationRequestBody,
  PostSandboxFunctionInvocationResponseBody,
} from "@app/types/api/sandbox_functions";
import { resolveFrameViewerAccess } from "@front-api/lib/api/frames/access";
import { unauthedApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  token: z.string().min(1),
  functionIdOrSlug: z.string().min(1),
});

const PostSandboxFunctionInvocationBodySchema = z
  .object({
    input: z.unknown().optional(),
    context: z
      .object({
        timezone: z.string().optional(),
      })
      .optional(),
  })
  .strict();

// Mounted at /api/v1/public/frames/:token/sandbox-functions.
const app = unauthedApp();

// Invoke a sandbox function from a shared frame, as an external email-only viewer. Access is
// gated by the verified frame-session cookie + an active grant; execution runs under a userless
// Authenticator confined to the frame's pod (see Authenticator.frameViewerForPod).
app.post(
  "/:functionIdOrSlug/invocations",
  validate("param", ParamsSchema),
  validate("json", PostSandboxFunctionInvocationBodySchema),
  async (ctx): HandlerResult<PostSandboxFunctionInvocationResponseBody> => {
    const { token, functionIdOrSlug } = ctx.req.valid("param");
    const body: PostSandboxFunctionInvocationRequestBody =
      ctx.req.valid("json");

    const access = await resolveFrameViewerAccess(ctx, token);
    if (!access) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "Share not found." },
      });
    }
    const { auth, podSpaceId } = access;

    if (!(await hasFeatureFlag(auth, "sandbox_functions"))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "feature_flag_not_found",
          message: "Sandbox Functions are not enabled for this workspace.",
        },
      });
    }

    // The pod-confined auth makes only this frame's pod reachable; the explicit space check is a
    // belt-and-suspenders guard against a function resolving from anywhere else.
    const sandboxFunction = await SandboxFunctionResource.fetchByIdOrSlug(
      auth,
      functionIdOrSlug
    );
    if (!sandboxFunction || sandboxFunction.space.sId !== podSpaceId) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "sandbox_function_not_found",
          message: "Sandbox function not found.",
        },
      });
    }

    const invocationResult = await sandboxFunction.invoke(auth, body);
    if (invocationResult.isErr()) {
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Sandbox function invocation failed.",
          },
        },
        invocationResult.error
      );
    }

    return ctx.json({ invocation: invocationResult.value.toJSON() }, 201);
  }
);

export default app;
