import type {
  PokeGetSandboxFunctionInvocation,
  PokeGetSandboxFunctionMCPActionOutput,
  PokeListSandboxFunctionInvocations,
} from "@app/lib/api/poke/sandbox_functions";
import {
  getSandboxFunctionInvocation,
  getSandboxFunctionMCPActionOutput,
  listSandboxFunctionInvocations,
} from "@app/lib/api/poke/sandbox_functions";
import {
  SANDBOX_FUNCTION_INVOCATION_ORIGINS,
  SANDBOX_FUNCTION_INVOCATION_STATUSES,
} from "@app/types/api/sandbox_functions";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pokePodFunctionApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const DEFAULT_INVOCATIONS_LIMIT = 25;
const MAX_INVOCATIONS_LIMIT = 200;

const InvocationsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_INVOCATIONS_LIMIT)
    .default(DEFAULT_INVOCATIONS_LIMIT),
  status: z.enum(SANDBOX_FUNCTION_INVOCATION_STATUSES).optional(),
  origin: z.enum(SANDBOX_FUNCTION_INVOCATION_ORIGINS).optional(),
});

const InvocationParamsSchema = z.object({
  invocationId: z.string().min(1),
});

const ActionOutputParamsSchema = z.object({
  invocationId: z.string().min(1),
  actionId: z.string().min(1),
});

// Mounted at
// /api/poke/workspaces/:wId/projects/:projectId/pod-functions/:functionId/invocations.
const app = pokePodFunctionApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", InvocationsQuerySchema),
  async (ctx): HandlerResult<PokeListSandboxFunctionInvocations> => {
    const auth = ctx.get("auth");
    const podFunction = ctx.get("podFunction");
    const { limit, status, origin } = ctx.req.valid("query");

    const items = await listSandboxFunctionInvocations(auth, {
      sandboxFunction: podFunction,
      limit,
      statuses: status ? [status] : undefined,
      origins: origin ? [origin] : undefined,
    });

    return ctx.json({ items });
  }
);

/** @ignoreswagger */
app.get(
  "/:invocationId",
  validate("param", InvocationParamsSchema),
  async (ctx): HandlerResult<PokeGetSandboxFunctionInvocation> => {
    const auth = ctx.get("auth");
    const podFunction = ctx.get("podFunction");
    const { invocationId } = ctx.req.valid("param");

    const invocation = await getSandboxFunctionInvocation(auth, {
      sandboxFunction: podFunction,
      invocationId,
    });
    if (!invocation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "sandbox_function_invocation_not_found",
          message: "Invocation not found.",
        },
      });
    }

    return ctx.json({ invocation });
  }
);

/** @ignoreswagger */
app.get(
  "/:invocationId/actions/:actionId/output",
  validate("param", ActionOutputParamsSchema),
  async (ctx): HandlerResult<PokeGetSandboxFunctionMCPActionOutput> => {
    const auth = ctx.get("auth");
    const podFunction = ctx.get("podFunction");
    const { invocationId, actionId } = ctx.req.valid("param");

    const outputResult = await getSandboxFunctionMCPActionOutput(auth, {
      sandboxFunction: podFunction,
      invocationId,
      actionId,
    });
    if (outputResult.isErr()) {
      switch (outputResult.error.type) {
        case "action_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "action_not_found",
              message: outputResult.error.message,
            },
          });
        case "output_read_failed":
          return apiError(
            ctx,
            {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Failed to read the MCP action output.",
              },
            },
            outputResult.error
          );
        default:
          return assertNever(outputResult.error.type);
      }
    }

    return ctx.json(outputResult.value);
  }
);

export default app;
