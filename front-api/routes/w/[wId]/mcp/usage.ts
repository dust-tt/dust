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

    // TODO(2024-08-04 aubin): Remove the withSkills compatibility path once legacy frontend traffic has drained.
    if (withSkills === "true") {
      const usage = await getToolsUsage(auth, { withSkills: true });
      return ctx.json({ usage });
    }

    const usage = await getToolsUsage(auth);
    return ctx.json({ usage });
  }
);

export default app;
