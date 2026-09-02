import { MCP_VALIDATION_OUTPUTS } from "@app/lib/actions/constants";
import { awaitSandboxFunctionInvocationOutcome } from "@app/lib/api/sandbox_functions/await_invocation";
import { isSandboxFunctionInvocationError } from "@app/lib/api/sandbox_functions/errors";
import { resolveSandboxFunctionWithCapability } from "@app/lib/api/sandbox_functions/frame_share_capability";
import { resolveSandboxFunctionActionAuthentication } from "@app/lib/api/sandbox_functions/resolve_authentication";
import { validateSandboxFunctionAction } from "@app/lib/api/sandbox_functions/validate_action";
import type {
  PostSandboxFunctionInvocationRequestBody,
  PostSandboxFunctionInvocationResponseBody,
} from "@app/types/api/sandbox_functions";
import { FRAME_SHARE_TOKEN_HEADER } from "@app/types/api/sandbox_functions";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { getSandboxFunctionInvocationErrorStatusCode } from "@front-api/lib/api/sandbox_function_invocation_errors";
import { redirectToSse } from "@front-api/lib/api/sse/redirect";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  functionIdOrSlug: z.string().min(1),
});

// Shared by the two action-resolution routes (validate-action, resolve-authentication).
const ActionResolutionParamsSchema = z.object({
  functionIdOrSlug: z.string().min(1),
  invocationId: z.string().min(1),
  actionId: z.string().min(1),
});

const ValidateActionBodySchema = z
  .object({
    approved: z.enum(MCP_VALIDATION_OUTPUTS),
  })
  .strict();

const ResolveAuthenticationBodySchema = z
  .object({
    outcome: z.enum(["completed", "denied"]),
  })
  .strict();

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

// Mounted at /api/w/:wId/sandbox-functions/:functionIdOrSlug/invocations.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/sandbox-functions/{functionId}/invocations/{invocationId}/events:
 *   get:
 *     summary: Stream sandbox function invocation events
 *     description: Stream real-time events for a Pod function invocation using Server-Sent Events (SSE). This endpoint is redirected to /api/sse/ for SSE traffic routing.
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
 *         description: ID of the Pod function
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

    const sandboxFunction = await resolveSandboxFunctionWithCapability(
      auth,
      functionIdOrSlug,
      ctx.req.header(FRAME_SHARE_TOKEN_HEADER)
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

    const invocationResult = await sandboxFunction.invoke(auth, body, {
      origin:
        auth.authMethod() === "session" ? "interactive_session" : "delegated",
    });
    if (invocationResult.isErr()) {
      if (isSandboxFunctionInvocationError(invocationResult.error)) {
        return apiError(ctx, {
          status_code: getSandboxFunctionInvocationErrorStatusCode(
            invocationResult.error.code
          ),
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
            message: "Sandbox function invocation failed.",
          },
        },
        invocationResult.error
      );
    }

    const invocation = invocationResult.value;
    // An inline execution settles the instance it ran on, so the outcome is usually already in
    // memory; the stream read-back is only for invocations that escalated to the workflow.
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

/** @ignoreswagger */
app.post(
  "/:invocationId/actions/:actionId/validate-action",
  validate("param", ActionResolutionParamsSchema),
  validate("json", ValidateActionBodySchema),
  async (ctx): HandlerResult<{ success: boolean }> => {
    const auth = ctx.get("auth");
    const { functionIdOrSlug, invocationId, actionId } = ctx.req.valid("param");
    const { approved } = ctx.req.valid("json");

    const sandboxFunction = await resolveSandboxFunctionWithCapability(
      auth,
      functionIdOrSlug,
      ctx.req.header(FRAME_SHARE_TOKEN_HEADER),
      { allowInactiveFramePublication: true }
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

    const result = await validateSandboxFunctionAction(auth, {
      sandboxFunction,
      invocationId,
      actionId,
      approvalState: approved,
    });
    if (result.isErr()) {
      switch (result.error.type) {
        case "action_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "action_not_found",
              message: result.error.message,
            },
          });
        case "action_not_blocked":
          // The client treats this error type as an already-successful validation (multi-client
          // races).
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "action_not_blocked",
              message: result.error.message,
            },
          });
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "invalid_request_error",
              message: result.error.message,
            },
          });
        default:
          return assertNever(result.error.type);
      }
    }

    return ctx.json({ success: true });
  }
);

/** @ignoreswagger */
app.post(
  "/:invocationId/actions/:actionId/resolve-authentication",
  validate("param", ActionResolutionParamsSchema),
  validate("json", ResolveAuthenticationBodySchema),
  async (ctx): HandlerResult<{ success: boolean }> => {
    const auth = ctx.get("auth");
    const { functionIdOrSlug, invocationId, actionId } = ctx.req.valid("param");
    const { outcome } = ctx.req.valid("json");

    const sandboxFunction = await resolveSandboxFunctionWithCapability(
      auth,
      functionIdOrSlug,
      ctx.req.header(FRAME_SHARE_TOKEN_HEADER),
      { allowInactiveFramePublication: true }
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

    const result = await resolveSandboxFunctionActionAuthentication(auth, {
      sandboxFunction,
      invocationId,
      actionId,
      outcome,
    });
    if (result.isErr()) {
      switch (result.error.type) {
        case "action_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "action_not_found",
              message: result.error.message,
            },
          });
        case "action_not_blocked":
          // The client treats this error type as an already-resolved authentication (multi-client
          // races).
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "action_not_blocked",
              message: result.error.message,
            },
          });
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "invalid_request_error",
              message: result.error.message,
            },
          });
        default:
          return assertNever(result.error.type);
      }
    }

    return ctx.json({ success: true });
  }
);

export default app;
