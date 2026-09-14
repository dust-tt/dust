import { listKeyScopableSpaces } from "@app/lib/api/keys/scopable_spaces";
import type { GetKeyScopableSpacesResponseBody } from "@app/types/api/keys";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/keys/spaces.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetKeyScopableSpacesResponseBody> => {
    const auth = ctx.get("auth");

    const spaces = await listKeyScopableSpaces(auth);

    return ctx.json({
      spaces: spaces.map((space) => space.toJSON()),
    });
  }
);

export default app;
