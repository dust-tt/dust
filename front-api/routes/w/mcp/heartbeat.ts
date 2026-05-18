import { Hono } from "hono";
import { z } from "zod";

import { updateMCPServerHeartbeat } from "@app/lib/api/actions/mcp/client_side_registry";

import { validate } from "../../../middleware/validator";

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

// Mounted under /api/w/:wId/mcp/heartbeat.
export const heartbeatApp = new Hono();

heartbeatApp.post(
  "/",
  validate("json", PostMCPHeartbeatRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const { serverId } = c.req.valid("json");

    const result = await updateMCPServerHeartbeat(auth, {
      serverId,
      workspaceId: auth.getNonNullableWorkspace().sId,
    });

    if (!result) {
      // Return 200 with success: false instead of 4xx to avoid triggering
      // monitoring alerts for expected conditions (expired/terminated
      // connections).
      return c.json({ success: false });
    }

    return c.json(result);
  }
);
