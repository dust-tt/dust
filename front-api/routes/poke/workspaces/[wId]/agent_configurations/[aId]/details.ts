import { listsAgentConfigurationVersions } from "@app/lib/api/assistant/configuration/agent";
import { getAuthors, getEditors } from "@app/lib/api/assistant/editors";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { PokeGetAgentDetails } from "@app/types/api/poke/agent_configurations";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import uniq from "lodash/uniq";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/agent_configurations/:aId/details.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeGetAgentDetails> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agentConfigurations = await listsAgentConfigurationVersions(auth, {
      agentId: aId,
      variant: "full",
    });

    if (agentConfigurations.length === 0) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "Agent configuration not found.",
        },
      });
    }

    const lastVersionEditors = await getEditors(auth, agentConfigurations[0]);
    const [latestAgentConfiguration] = agentConfigurations;

    const allRequestedSpaceIds = uniq(
      agentConfigurations.flatMap((config) => config.requestedSpaceIds)
    );
    const spaces = await SpaceResource.fetchByIds(auth, allRequestedSpaceIds);
    const authors = await getAuthors(agentConfigurations);

    // `SkillResource.listByAgentConfigurations` only works for custom agents, as global agents are not versioned.
    const skillsByVersion: Record<number, SkillType[]> = {};
    if (isGlobalAgentId(aId)) {
      const allSkills = await SkillResource.listByAgentConfiguration(
        auth,
        latestAgentConfiguration
      );
      skillsByVersion[latestAgentConfiguration.version] = allSkills.map((s) =>
        s.toJSON(auth)
      );
    } else {
      const skillsByAgent = await SkillResource.listByAgentConfigurations(
        auth,
        agentConfigurations
      );
      for (const config of agentConfigurations) {
        skillsByVersion[config.version] = [];
      }
      for (const { agentConfiguration, skill } of skillsByAgent) {
        skillsByVersion[agentConfiguration.version].push(skill.toJSON(auth));
      }
    }

    return ctx.json({
      agentConfigurations,
      authors,
      lastVersionEditors,
      spaces: spaces.map((s) => s.toJSON()),
      skillsByVersion,
    });
  }
);

export default app;
