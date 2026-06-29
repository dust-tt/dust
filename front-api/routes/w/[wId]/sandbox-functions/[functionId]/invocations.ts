import { randomUUID } from "node:crypto";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type {
  PostSandboxFunctionInvocationRequestBody,
  PostSandboxFunctionInvocationResponseBody,
} from "@app/types/api/sandbox/functions";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  functionId: z.string().min(1),
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

// Mounted at /api/w/:wId/sandbox-functions/:functionId/invocations.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostSandboxFunctionInvocationBodySchema),
  async (ctx): HandlerResult<PostSandboxFunctionInvocationResponseBody> => {
    const auth = ctx.get("auth");
    const { functionId } = ctx.req.valid("param");

    const body: PostSandboxFunctionInvocationRequestBody =
      ctx.req.valid("json");

    const sandboxFunction = await SandboxFunctionResource.fetchById(
      auth,
      functionId
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

    // TODO(spolu): implement sandbox function invocation
    void body;

    return ctx.json(
      {
        invocation: {
          id: randomUUID(),
          functionId: sandboxFunction.sId,
          status: "created",
          createdAt: new Date().toISOString(),
        },
      },
      201
    );
  }
);

export default app;
