import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeScript } from "@app/scripts/helpers";

// DeepSeek R1 has been decommissioned across all the providers that served it
// (Fireworks, TogetherAI, and the DeepSeek API). Migrate every active agent
// still relying on one of these model ids to the latest DeepSeek model
// (DeepSeek V4 Pro, served via Fireworks).
//
// All model ids (sources and target) are hardcoded on purpose so this
// migration is a frozen snapshot: it keeps working after the source configs
// are removed from the codebase, and won't silently change target if the
// "latest DeepSeek model" pointer moves later.
const TARGET_PROVIDER_ID = "fireworks";
const TARGET_MODEL_ID = "accounts/fireworks/models/deepseek-v4-pro";

const SOURCE_MODEL_IDS = [
  "accounts/fireworks/models/deepseek-r1-0528", // fireworks
  "deepseek-ai/DeepSeek-R1", // togetherai
  "deepseek-reasoner", // deepseek api
] as const;

const AgentConfigurationModelWithBypass: ModelStaticWorkspaceAware<AgentConfigurationModel> =
  AgentConfigurationModel;

makeScript({}, async ({ execute }, logger) => {
  for (const from of SOURCE_MODEL_IDS) {
    const agents = await AgentConfigurationModelWithBypass.findAll({
      where: {
        modelId: from,
        status: "active",
      },
      // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    logger.info(
      { count: agents.length, from, to: TARGET_MODEL_ID },
      `Found ${agents.length} active agents on ${from}, migrating to ${TARGET_MODEL_ID}.`
    );

    for (const agent of agents) {
      logger.info(
        {
          sId: agent.sId,
          version: agent.version,
          workspaceId: agent.workspaceId,
          fromProviderId: agent.providerId,
          fromModelId: from,
        },
        `Migrating agent ${agent.sId} (version ${agent.version}) from ${from} to ${TARGET_MODEL_ID}.`
      );

      if (execute) {
        await agent.update({
          providerId: TARGET_PROVIDER_ID,
          modelId: TARGET_MODEL_ID,
        });
      }
    }
  }

  logger.info("Migration complete.");
});
