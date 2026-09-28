import { canAdminSeePrivateEntities } from "@app/lib/api/assistant/configuration/private_entities";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { GetAgentSkillsResponseBody } from "@app/types/api/assistant/configuration/skills";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/skills.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetAgentSkillsResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    // Skills carry their instructions: they are as private as the agent's own prompt. Only readers
    // get them, and admins with the `admin_can_see_private_entities` feature flag.
    const agent = await AgentResource.fetchById(auth, aId);
    const adminCanSeePrivateEntities = await canAdminSeePrivateEntities(auth);
    if (!agent || (!auth.can("read", agent) && !adminCanSeePrivateEntities)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }

    // With the flag, the skills built on spaces the admin cannot read are listed too.
    const skills = await agent.listSkills(auth, {
      permissionFiltering: adminCanSeePrivateEntities
        ? "dangerously_skip"
        : "strict",
    });
    return ctx.json({ skills: skills.map((s) => s.toJSON(auth)) });
  }
);

export default app;
