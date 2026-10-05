import { AgentResource } from "@app/lib/resources/agent_resource";
import { toAgentConfigurations } from "@app/lib/resources/agent_resource_serialization";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { PokeGetAgentDetails } from "@app/types/api/poke/agent_configurations";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { removeNulls } from "@app/types/shared/utils/general";
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

    // Poke's superuser authenticator views every version's content (see
    // `poke-agent-content-access`).
    const agent = await AgentResource.fetchById(auth, aId);
    const versions = agent ? await agent.listVersions(auth) : [];

    if (!agent || versions.length === 0) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "Agent configuration not found.",
        },
      });
    }

    const [agentConfigurations, lastVersionEditors, spaces, authors, skills] =
      await Promise.all([
        toAgentConfigurations(auth, versions),
        agent.listEditors(auth),
        SpaceResource.fetchByModelIds(
          auth,
          uniq(versions.flatMap((version) => version.requestedSpaceModelIds()))
        ),
        UserResource.fetchByModelIds(
          uniq(removeNulls(versions.map((version) => version.versionAuthorId)))
        ),
        SkillResource.listByAgents(auth, versions),
      ]);

    const skillsByVersion: Record<number, SkillType[]> = Object.fromEntries(
      versions.map((version) => [
        version.version,
        (skills.get(version) ?? []).map((skill) => skill.toJSON(auth)),
      ])
    );

    return ctx.json({
      agentConfigurations,
      authors: authors.map((author) => author.toJSON()),
      lastVersionEditors: (lastVersionEditors ?? []).map((editor) =>
        editor.toJSON()
      ),
      spaces: await SpaceResource.enrichSpacesWithAccess(auth, spaces),
      skillsByVersion,
    });
  }
);

export default app;
