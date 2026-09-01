import { awaitSandboxFunctionInvocationOutcome } from "@app/lib/api/sandbox_functions/await_invocation";
import { isSandboxFunctionInvocationError } from "@app/lib/api/sandbox_functions/errors";
import { resolveActiveFrameFunctionForUse } from "@app/lib/api/sandbox_functions/frame_share_capability";
import type {
  PostSandboxFunctionInvocationRequestBody,
  PostSandboxFunctionInvocationResponseBody,
} from "@app/types/api/sandbox_functions";
import {
  FrameFunctionInvocationParamsSchema,
  PostFrameFunctionInvocationBodySchema,
} from "@front-api/lib/api/frame_function_invocation_schemas";
import { getSandboxFunctionInvocationErrorStatusCode } from "@front-api/lib/api/sandbox_function_invocation_errors";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", FrameFunctionInvocationParamsSchema),
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
