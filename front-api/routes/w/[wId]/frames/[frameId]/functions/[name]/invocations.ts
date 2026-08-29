import { awaitSandboxFunctionInvocationOutcome } from "@app/lib/api/sandbox_functions/await_invocation";
import { isSandboxFunctionInvocationError } from "@app/lib/api/sandbox_functions/errors";
import { resolveActiveFrameFunctionForUse } from "@app/lib/api/sandbox_functions/frame_share_capability";
import type {
  PostSandboxFunctionInvocationRequestBody,
  PostSandboxFunctionInvocationResponseBody,
} from "@app/types/api/sandbox_functions";
import { isValidSandboxFunctionSlug } from "@app/types/api/sandbox_functions";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  frameId: z.string().min(1),
  name: z.string().refine(isValidSandboxFunctionSlug),
});

const PostFrameFunctionInvocationBodySchema = z
  .object({
    input: z.unknown().optional(),
    context: z
      .object({
        timezone: z.string().optional(),
      })
      .optional(),
  })
  .strict();

const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/frames/{frameId}/functions/{name}/invocations:
 *   post:
 *     summary: Invoke an active Frames v2 function
 *     description: Resolves a bare function name from the Frame's active immutable publication, checks Frame use rights, and starts an invocation pinned to that publication.
 *     tags:
 *       - Private Frames
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: frameId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         description: Bare function name declared by the active Frame publication.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PrivateFrameFunctionInvocationRequest'
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: Invocation created. Fast invocations may also include their terminal outcome.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PrivateFrameFunctionInvocationResponse'
 *       401:
 *         description: The function requires a workspace member or a stricter caller identity.
 *       404:
 *         description: Frame, active publication, function, or Frame use right not found.
 *       500:
 *         description: Invocation failed before it could be created.
 */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostFrameFunctionInvocationBodySchema),
  async (ctx): HandlerResult<PostSandboxFunctionInvocationResponseBody> => {
    const auth = ctx.get("auth");
    const { frameId, name } = ctx.req.valid("param");
    const body: PostSandboxFunctionInvocationRequestBody =
      ctx.req.valid("json");

    const sandboxFunction = await resolveActiveFrameFunctionForUse(auth, {
      frameId,
      functionName: name,
    });
    if (!sandboxFunction) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "sandbox_function_not_found",
          message: "Frame function not found.",
        },
      });
    }

    const invocationResult = await sandboxFunction.invoke(auth, body, {
      origin:
        auth.authMethod() === "session" ? "interactive_session" : "delegated",
    });
    if (invocationResult.isErr()) {
      if (isSandboxFunctionInvocationError(invocationResult.error)) {
        return apiError(ctx, {
          status_code: 401,
          api_error: {
            type: invocationResult.error.code,
            message: invocationResult.error.message,
          },
        });
      }
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Frame function invocation failed.",
          },
        },
        invocationResult.error
      );
    }

    const invocation = invocationResult.value;
    const outcome =
      invocation.settledOutcome() ??
      (await awaitSandboxFunctionInvocationOutcome({
        invocationId: invocation.sId,
      }));

    return ctx.json(
      {
        invocation: invocation.toJSON(),
        ...(outcome ? { outcome } : {}),
      },
      201
    );
  }
);

export default app;
