import type { PokeListFrames } from "@app/lib/api/poke/frames";
import { listWorkspaceFrames } from "@app/lib/api/poke/frames";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import frameId from "./[frameId]";

const ListFramesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
  orderDirection: z.enum(["asc", "desc"]).optional().default("desc"),
  hasSandbox: z.enum(["true", "false"]).optional().default("false"),
});

// Mounted at /api/poke/workspaces/:wId/frames.
const app = pokeApp();

app.route("/:frameId", frameId);

/** @ignoreswagger */
app.get(
  "/",
  validate("query", ListFramesQuerySchema),
  async (ctx): HandlerResult<PokeListFrames> => {
    const auth = ctx.get("auth");
    const { limit, offset, orderDirection, hasSandbox } =
      ctx.req.valid("query");

    const frames = await listWorkspaceFrames(auth, {
      limit,
      offset,
      orderDirection,
      hasSandbox: hasSandbox === "true",
    });

    return ctx.json(frames);
  }
);

export default app;
