import {
  getPokeWorkspaceInfo,
  type PokeWorkspaceInfo,
} from "@app/lib/api/poke/workspace_info";
import { pokeWorkspaceApp } from "@front-api/middleware/env";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";

export type PokeGetWorkspaceInfo = PokeWorkspaceInfo;

// Mounted at /api/poke/workspaces/:wId/workspace-info.
const app = pokeWorkspaceApp();

app.get("/", async (ctx): HandlerResult<PokeGetWorkspaceInfo> => {
  const auth = ctx.get("auth");

  const result = await getPokeWorkspaceInfo(auth);
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  return ctx.json(result.value);
});

export default app;
