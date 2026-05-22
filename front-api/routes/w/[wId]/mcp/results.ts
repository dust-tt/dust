import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import { publishMCPResults } from "@app/lib/api/assistant/mcp_events";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PostMCPResultsBodySchema = z.object({
  result: z.unknown(),
  serverId: z.string(),
});

// Mounted at /api/w/:wId/mcp/results.
const app = workspaceApp();

app.post("/", validate("json", PostMCPResultsBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { serverId, result } = ctx.req.valid("json");

  const isValidAccess = await validateMCPServerAccess(auth, { serverId });
  if (!isValidAccess) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "mcp_auth_error",
        message: "You don't have access to this MCP server or it has expired.",
      },
    });
  }

  await publishMCPResults(auth, {
    mcpServerId: serverId,
    result,
  });

  return ctx.json({ success: true });
});

export default app;
