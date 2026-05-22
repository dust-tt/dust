import { updateMCPServerHeartbeat } from "@app/lib/api/actions/mcp/client_side_registry";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PostMCPHeartbeatRequestBodySchema = z.object({
  serverId: z.string(),
});

export type PostMCPHeartbeatRequestBody = z.infer<
  typeof PostMCPHeartbeatRequestBodySchema
>;

interface MCPServerHeartbeatSuccess {
  expiresAt: string;
  success: true;
}

interface MCPServerHeartbeatFailure {
  success: false;
}

export type HeartbeatMCPResponseType =
  | MCPServerHeartbeatSuccess
  | MCPServerHeartbeatFailure;

// Mounted at /api/w/:wId/mcp/heartbeat.
const app = workspaceApp();

app.post(
  "/",
  validate("json", PostMCPHeartbeatRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { serverId } = ctx.req.valid("json");

    const result = await updateMCPServerHeartbeat(auth, {
      serverId,
      workspaceId: auth.getNonNullableWorkspace().sId,
    });

    if (!result) {
      // Return 200 with success: false instead of 4xx to avoid triggering
      // monitoring alerts for expected conditions (expired/terminated
      // connections).
      return ctx.json({ success: false });
    }

    return ctx.json(result);
  }
);

export default app;
