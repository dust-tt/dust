import { getToolsUsage } from "@app/lib/api/agent_actions";
import type {
  GetMCPServersUsageResponseBody,
  GetMCPServersUsageWithSkillsResponseBody,
} from "@app/lib/api/mcp";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const QuerySchema = z.object({
  withSkills: z.enum(["true", "false"]).optional(),
});

// Mounted at /api/w/:wId/mcp/usage.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", QuerySchema),
  async (
    ctx
  ): HandlerResult<
    GetMCPServersUsageResponseBody | GetMCPServersUsageWithSkillsResponseBody
  > => {
    const auth = ctx.get("auth");
    const { withSkills } = ctx.req.valid("query");
    const usage =
      withSkills === "true"
        ? await getToolsUsage(auth, { withSkills: true })
        : await getToolsUsage(auth);
    return ctx.json({ usage });
  }
);

export default app;
