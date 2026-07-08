import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox_functions/events";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type {
  PostSandboxFunctionInvocationRequestBody,
  PostSandboxFunctionInvocationResponseBody,
} from "@app/types/api/sandbox_functions";
import { redirectToSse } from "@front-api/lib/api/sse/redirect";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  functionIdOrSlug: z.string().min(1),
});

const PostSandboxFunctionInvocationBodySchema = z
  .object({
    input: z.unknown().optional(),
    context: z
      .object({
        frameFileId: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

// Mounted at /api/w/:wId/sandbox-functions/:functionIdOrSlug/invocations.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/sandbox-functions/{functionId}/invocations/{invocationId}/events:
 *   get:
 *     summary: Stream sandbox function invocation events
 *     description: Stream real-time events for a sandbox function invocation using Server-Sent Events (SSE). This endpoint is redirected to /api/sse/ for SSE traffic routing.
 *     tags:
 *       - Private Events
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: functionId
 *         required: true
 *         description: ID of the sandbox function
 *         schema:
 *           type: string
 *       - in: path
 *         name: invocationId
 *         required: true
 *         description: ID of the sandbox function invocation
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: |
 *           SSE event stream. Each event is sent as `data: {json}\n\n`.
 *           Events are discriminated by the `type` field.
 *         content:
 *           text/event-stream:
 *             schema:
 *               $ref: '#/components/schemas/PrivateSandboxFunctionInvocationEvent'
 *       401:
 *         description: Unauthorized
 */
app.get("/:invocationId/events", redirectToSse);

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostSandboxFunctionInvocationBodySchema),
  async (ctx): HandlerResult<PostSandboxFunctionInvocationResponseBody> => {
    const auth = ctx.get("auth");
    const { functionIdOrSlug } = ctx.req.valid("param");

    const body: PostSandboxFunctionInvocationRequestBody =
      ctx.req.valid("json");

    const sandboxFunction = await SandboxFunctionResource.fetchByIdOrSlug(
      auth,
      functionIdOrSlug
    );
    if (!sandboxFunction) {
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

    await publishSandboxFunctionInvocationEvent(
      {
        type: "sandbox_function_invocation_created",
        created: Date.parse(invocationResult.value.createdAt),
        invocation: invocationResult.value,
      },
      { invocationId: invocationResult.value.sId }
    );

    return ctx.json(
      {
        invocation: invocationResult.value,
      },
      201
    );
  }
);

export default app;
