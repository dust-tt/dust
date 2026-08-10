import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeScript } from "@app/scripts/helpers";
import { CLAUDE_SONNET_4_6_MODEL_ID } from "@app/types/assistant/models/anthropic";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";

// Migrate active agents running on Claude Sonnet 4.6 with medium reasoning to
// the Standard (Auto) meta-model, which routes across the preferred catalog at
// message-send time.
const FROM_MODEL_ID = CLAUDE_SONNET_4_6_MODEL_ID;
const FROM_REASONING_EFFORT = "medium";

const AgentConfigurationModelWithBypass: ModelStaticWorkspaceAware<AgentConfigurationModel> =
  AgentConfigurationModel;

makeScript({}, async ({ execute }, logger) => {
  const agents = await AgentConfigurationModelWithBypass.findAll({
    where: {
      modelId: FROM_MODEL_ID,
      reasoningEffort: FROM_REASONING_EFFORT,
      status: "active",
    },
    // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  logger.info(
    { count: agents.length, from: FROM_MODEL_ID, to: AUTO_MODEL_ID },
    `Found ${agents.length} active agents on ${FROM_MODEL_ID} (${FROM_REASONING_EFFORT} reasoning), migrating to ${AUTO_MODEL_ID}.`
  );

  for (const agent of agents) {
    if (execute) {
      logger.info(
        {
          sId: agent.sId,
          version: agent.version,
          workspaceId: agent.workspaceId,
        },
        `Migrating agent ${agent.sId} (version ${agent.version}) from ${FROM_MODEL_ID} to ${AUTO_MODEL_ID}.`
      );

      await agent.update({
        providerId: AUTO_MODEL_ID,
        modelId: AUTO_MODEL_ID,
        reasoningEffort: "none",
      });
    }
  }

  logger.info("Migration complete.");
});
