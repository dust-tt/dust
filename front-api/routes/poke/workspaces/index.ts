import type { PokeWorkspaceType } from "@app/lib/api/poke/workspaces";
import { listWorkspacesForPoke } from "@app/lib/api/poke/workspaces";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type GetPokeWorkspacesResponseBody = {
  workspaces: PokeWorkspaceType[];
};

// Mounted at /api/poke/workspaces. pokeAuth is applied by the parent poke
// sub-app. Note: this is the workspace LIST endpoint only; the workspace
// sub-app at /api/poke/workspaces/:wId/... will be migrated separately with
// its own workspace-scoped auth middleware.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const upgradedQuery = c.req.query("upgraded");
  const searchQuery = c.req.query("search");
  const limitQuery = c.req.query("limit");

  let listUpgraded: boolean | undefined;
  if (upgradedQuery !== undefined) {
    if (!["true", "false"].includes(upgradedQuery)) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The request query is invalid, expects { upgraded: boolean }.",
        },
      });
    }
    listUpgraded = upgradedQuery === "true";
  }

  let limit = 0;
  if (limitQuery !== undefined) {
    if (!/^\d+$/.test(limitQuery)) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The request query is invalid, expects { limit: number }.",
        },
      });
    }
    limit = parseInt(limitQuery, 10);
  }

  const searchTerm = searchQuery
    ? decodeURIComponent(searchQuery).trim()
    : undefined;

  const workspaces = await listWorkspacesForPoke(auth, {
    listUpgraded,
    searchTerm,
    limit,
  });

  const body: GetPokeWorkspacesResponseBody = { workspaces };
  return c.json(body);
});

export default app;
