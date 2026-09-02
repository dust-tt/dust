import type {
  PokeGetFrameFunction,
  PokeGetFrameFunctionSource,
} from "@app/lib/api/poke/frames";
import {
  getFrameFunctionDetails,
  getFrameFunctionSource,
} from "@app/lib/api/poke/frames";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pokeFrameFunctionApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { withFrameFunction } from "@front-api/middlewares/with_frames";

import invocations from "./invocations";

// Mounted at /api/poke/workspaces/:wId/frames/:frameId/functions/:functionId.
const app = pokeFrameFunctionApp();

app.use("*", withFrameFunction());

app.route("/invocations", invocations);

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeGetFrameFunction> => {
  const frame = ctx.get("frame");
  const frameFunction = ctx.get("frameFunction");

  return ctx.json({
    frameFunction: getFrameFunctionDetails(frame, frameFunction),
  });
});

/** @ignoreswagger */
app.get("/source", async (ctx): HandlerResult<PokeGetFrameFunctionSource> => {
  const auth = ctx.get("auth");
  const frame = ctx.get("frame");
  const frameFunction = ctx.get("frameFunction");

  const sourceResult = await getFrameFunctionSource(auth, {
    frame,
    sandboxFunction: frameFunction,
  });
  if (sourceResult.isErr()) {
    switch (sourceResult.error.type) {
      case "not_published":
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "file_not_found",
            message: "This Frame function has no published bundle.",
          },
        });
      case "bundle_not_found":
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "file_not_found",
            message:
              "The published bundle for this Frame function is missing from storage.",
          },
        });
      default:
        return assertNever(sourceResult.error.type);
    }
  }

  return ctx.json({ source: sourceResult.value });
});

export default app;
