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
  async (ctx) => {
    const auth = ctx.get("auth");
    const { serverId } = ctx.req.valid("json");

    await deregisterMCPServer(auth, { serverId });

    return ctx.json({ success: true });
  }
);

export default app;
