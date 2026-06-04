import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
});

export type GetAgentSkillsResponseBody = {
  skills: SkillType[];
};

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/skills.
const app = workspaceApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetAgentSkillsResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agent = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "full",
    });
    if (!agent) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }

    const skills = await SkillResource.listByAgentConfiguration(auth, agent);
    return ctx.json({ skills: skills.map((s) => s.toJSON(auth)) });
  }
);

export default app;
