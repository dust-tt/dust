import { deregisterMCPServer } from "@app/lib/api/actions/mcp/client_side_registry";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const PostMCPDeregisterRequestBodySchema = z.object({
  serverId: z.string(),
});

export type PostMCPDeregisterRequestBody = z.infer<
  typeof PostMCPDeregisterRequestBodySchema
>;

// Mounted at /api/w/:wId/mcp/deregister.
const app = new Hono();

app.post(
  "/",
  validate("json", PostMCPDeregisterRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const { serverId } = c.req.valid("json");

    await deregisterMCPServer(auth, { serverId });

    return c.json({ success: true });
  }
);

export default app;
