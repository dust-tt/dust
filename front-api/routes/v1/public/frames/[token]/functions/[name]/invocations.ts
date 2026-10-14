import { awaitSandboxFunctionInvocationOutcome } from "@app/lib/api/sandbox_functions/await_invocation";
import { isSandboxFunctionInvocationError } from "@app/lib/api/sandbox_functions/errors";
import { resolveActiveFrameFunctionForUse } from "@app/lib/api/sandbox_functions/frame_share_capability";
import {
  FRAME_SESSION_COOKIE_NAME,
  getFrameSessionEmail,
} from "@app/lib/api/share/frame_session";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type {
  PostSandboxFunctionInvocationRequestBody,
  PostSandboxFunctionInvocationResponseBody,
} from "@app/types/api/sandbox_functions";
import type { Result } from "@app/types/shared/result";
import {
  FrameFunctionInvocationParamsSchema,
  PostFrameFunctionInvocationBodySchema,
} from "@front-api/lib/api/frame_function_invocation_schemas";
import { getSandboxFunctionInvocationErrorStatusCode } from "@front-api/lib/api/sandbox_function_invocation_errors";
import { bodyLimit } from "@front-api/middlewares/body_limit";
import { unauthedApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { resolveOptionalAuth } from "@front-api/routes/v1/public/frames/shared_auth";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";

const PUBLIC_FRAME_FUNCTION_BODY_MAX_SIZE_BYTES = 1024 * 1024;

const ParamsSchema = FrameFunctionInvocationParamsSchema.pick({
  name: true,
}).extend({
  token: z.string().min(1),
});

/**
 * @cc [owner:achilleburah,label:security] external-viewer-email-from-frame-session
 * The email MUST be the email of a valid frame session cookie for `workspace`, else null. Nothing
 * else from the request MAY supply it.
 */
async function resolveExternalViewerEmail(
  ctx: Context,
  workspace: WorkspaceResource
): Promise<string | null> {
  const sessionToken = getCookie(ctx, FRAME_SESSION_COOKIE_NAME);

  return sessionToken
    ? getFrameSessionEmail(workspace, { token: sessionToken })
    : null;
}

type InvokeFromShareInput = {
  frame: FileResource;
  functionName: string;
  body: PostSandboxFunctionInvocationRequestBody;
};

async function invokeAsMember(
  auth: Authenticator,
  { frame, functionName, body }: InvokeFromShareInput
): Promise<Result<SandboxFunctionInvocationResource, Error> | null> {
  const sandboxFunction = await resolveActiveFrameFunctionForUse(auth, {
    frameId: frame.sId,
    functionName,
  });
  if (!sandboxFunction) {
    return null;
  }

  return sandboxFunction.invoke(auth, body, {
    origin:
      auth.authMethod() === "session" ? "interactive_session" : "delegated",
  });
}

async function invokeAsExternalViewer(
  ctx: Context,
  workspace: WorkspaceResource,
  { frame, functionName, body }: InvokeFromShareInput
): Promise<Result<SandboxFunctionInvocationResource, Error> | null> {
  const auth = await Authenticator.fromJSON({
    authMethod: "anonymous",
    workspaceId: workspace.sId,
    userId: null,
    role: "none",
    groupIds: [],
    subscriptionId: null,
    isByok: false,
  });

  const sandboxFunction = await SandboxFunctionResource.fetchActiveForAnonymous(
    auth,
    { frame, slug: functionName }
  );
  if (!sandboxFunction) {
    return null;
  }

  return sandboxFunction.invokeAnonymously(auth, {
    body,
    viewerEmail: await resolveExternalViewerEmail(ctx, workspace),
  });
}

// Mounted at /api/v1/public/frames/:token/functions/:name/invocations.
const app = unauthedApp();

/** @ignoreswagger */
app.post(
  "/",
  bodyLimit(PUBLIC_FRAME_FUNCTION_BODY_MAX_SIZE_BYTES),
  validate("param", ParamsSchema),
  validate("json", PostFrameFunctionInvocationBodySchema),
  async (ctx): HandlerResult<PostSandboxFunctionInvocationResponseBody> => {
    const { token, name } = ctx.req.valid("param");
    const body: PostSandboxFunctionInvocationRequestBody =
      ctx.req.valid("json");

    const shareResult = await FileResource.fetchByShareToken(token);
    const workspace = shareResult.isOk()
      ? await WorkspaceResource.fetchByModelId(
          shareResult.value.file.workspaceId
        )
      : null;
    if (shareResult.isErr() || !workspace) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "sandbox_function_not_found",
          message: "Frame function not found.",
        },
      });
    }

    const memberAuth = await resolveOptionalAuth(ctx, workspace.sId);
    const invocationInput = {
      frame: shareResult.value.file,
      functionName: name,
      body,
    };
    const invocationResult = memberAuth
      ? await invokeAsMember(memberAuth, invocationInput)
      : await invokeAsExternalViewer(ctx, workspace, invocationInput);
    if (!invocationResult) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "sandbox_function_not_found",
          message: "Frame function not found.",
        },
      });
    }
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
