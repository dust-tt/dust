import { getPaginationParams } from "@app/lib/api/pagination";
import type { PokeListFrames } from "@app/lib/api/poke/frames";
import { listWorkspaceFrames } from "@app/lib/api/poke/frames";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

import frameId from "./[frameId]";

// Mounted at /api/poke/workspaces/:wId/frames.
const app = pokeApp();

app.route("/:frameId", frameId);

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeListFrames> => {
  const auth = ctx.get("auth");

  const paginationRes = getPaginationParams(ctx.req.query(), {
    defaultLimit: 20,
    defaultOrderColumn: "updatedAt",
    defaultOrderDirection: "desc",
    supportedOrderColumn: ["updatedAt"],
  });
  if (paginationRes.isErr()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: paginationRes.error.reason,
      },
    });
  }

  const { limit, lastValue, orderDirection } = paginationRes.value;

  const frames = await listWorkspaceFrames(auth, {
    limit,
    lastValue,
    orderDirection,
  });

  return ctx.json(frames);
});

export default app;
