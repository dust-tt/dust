import {
  getPodFunctionLastFailure,
  listPodFunctionFrameUsage,
  listPodFunctions,
} from "@app/lib/api/pod_functions";
import type {
  GetPodFunctionFrameUsageResponseBody,
  GetPodFunctionLastFailureResponseBody,
  GetPodFunctionsResponseBody,
} from "@app/types/api/sandbox_functions";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSandboxFunctionsFeature } from "@front-api/middlewares/with_sandbox_functions_feature";
import { withSpace } from "@front-api/middlewares/with_space";
import { z } from "zod";

const LastFailureParamsSchema = z.object({
  functionId: z.string().min(1),
});

// Mounted at /api/w/:wId/spaces/:spaceId/sandbox-functions. Readable by any pod member: the
// inventory describes what the pod can do, it does not expose function source or run payloads.
const app = workspaceApp();

app.use("*", withSandboxFunctionsFeature());

/** @ignoreswagger */
app.get(
  "/",
  withSpace({ requireCanRead: true }),
  async (ctx): HandlerResult<GetPodFunctionsResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Only pods can have pod functions.",
        },
      });
    }

    const functions = await listPodFunctions(auth, space);

    return ctx.json({ functions });
  }
);

/** @ignoreswagger */
app.get(
  "/frame-usage",
  withSpace({ requireCanRead: true }),
  async (ctx): HandlerResult<GetPodFunctionFrameUsageResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Only pods can have pod functions.",
        },
      });
    }

    const usage = await listPodFunctionFrameUsage(auth, space);

    return ctx.json({ usage });
  }
);

/** @ignoreswagger */
app.get(
  "/:functionId/last-failure",
  withSpace({ requireCanRead: true }),
  validate("param", LastFailureParamsSchema),
  async (ctx): HandlerResult<GetPodFunctionLastFailureResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { functionId } = ctx.req.valid("param");

    const failure = await getPodFunctionLastFailure(auth, {
      space,
      podFunctionId: functionId,
    });

    return ctx.json({ failure });
  }
);

export default app;
