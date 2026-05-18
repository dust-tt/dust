import { Hono } from "hono";
import { z } from "zod";

import { deregisterMCPServer } from "@app/lib/api/actions/mcp/client_side_registry";

import { validate } from "../../../middleware/validator";

const PostMCPDeregisterRequestBodySchema = z.object({
  serverId: z.string(),
});

export type PostMCPDeregisterRequestBody = z.infer<
  typeof PostMCPDeregisterRequestBodySchema
>;

// Mounted under /api/w/:wId/mcp/deregister.
export const deregisterApp = new Hono();

deregisterApp.post(
  "/",
  validate("json", PostMCPDeregisterRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const { serverId } = c.req.valid("json");

    await deregisterMCPServer(auth, { serverId });

    return c.json({ success: true });
  }
);
