import type { PokeGetFrameDatabaseSchema } from "@app/lib/api/poke/frames";
import { getFrameDatabaseSchema } from "@app/lib/api/poke/frames";
import { FRAME_DATABASE_NAME_REGEX } from "@app/types/api/frame_manifest";
import { pokeFrameApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

// The name reaches a sandbox command, so it is validated against the manifest's own regex rather
// than trusted from the path.
const ParamsSchema = z.object({
  database: z.string().regex(FRAME_DATABASE_NAME_REGEX),
});

// Mounted at /api/poke/workspaces/:wId/frames/:frameId/databases/:database/schema.
const app = pokeFrameApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeGetFrameDatabaseSchema> => {
    const auth = ctx.get("auth");
    const frame = ctx.get("frame");
    const { database } = ctx.req.valid("param");

    const result = await getFrameDatabaseSchema(auth, { frame, database });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to read the Frame database schema: ${result.error.message}`,
        },
      });
    }

    return ctx.json({ schema: result.value });
  }
);

export default app;
