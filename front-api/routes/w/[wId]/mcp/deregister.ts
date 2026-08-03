import { deregisterMCPServer } from "@app/lib/api/actions/mcp/client_side_registry";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PostMCPDeregisterRequestBodySchema = z.object({
  serverId: z.string(),
});

export type PostMCPDeregisterRequestBody = z.infer<
  typeof PostMCPDeregisterRequestBodySchema
>;

// Mounted at /api/w/:wId/mcp/deregister.
const app = workspaceApp();

/** @ignoreswagger */
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
