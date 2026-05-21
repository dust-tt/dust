import { getWorkOSOrganizationDSyncDirectories } from "@app/lib/api/workos/organization";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type PokeDsyncResponseBody = Omit<
  WorkOSConnectionSyncStatus,
  "setupLink"
>;

// Mounted at /api/poke/workspaces/:wId/dsync.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<PokeDsyncResponseBody> => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();

  const r = await getWorkOSOrganizationDSyncDirectories({ workspace: owner });
  if (r.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "workos_server_error",
        message: `Failed to list directories: ${normalizeError(r.error).message}`,
      },
    });
  }
  const directories = r.value;

  if (directories.length > 1) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "workos_multiple_directories_not_supported",
        message: "Multiple directories are not supported.",
      },
    });
  }

  const [activeDirectory] = directories;

  let status: WorkOSConnectionSyncStatus["status"] = "not_configured";
  if (activeDirectory) {
    status = activeDirectory.state === "active" ? "configured" : "configuring";
  }

  return ctx.json({
    status,
    connection: activeDirectory
      ? {
          id: activeDirectory.id,
          state: activeDirectory.state,
          type: activeDirectory.type,
        }
      : null,
  });
});

export default app;
