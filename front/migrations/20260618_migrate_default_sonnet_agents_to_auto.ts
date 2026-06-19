import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeScript } from "@app/scripts/helpers";
import { CLAUDE_SONNET_4_6_MODEL_ID } from "@app/types/assistant/models/anthropic";
import {
  AUTO_MODEL_ID,
  AUTO_PROVIDER_ID,
} from "@app/types/assistant/models/dust";

// Moves active agents still on the previous default (Anthropic Claude Sonnet
// 4.6) onto the "auto" tier, so Dust picks the model at runtime with outage
// backup. Idempotent: rows already on "auto" are not matched. Run on demand,
// after customers have been notified.
const AgentConfigurationModelWithBypass: ModelStaticWorkspaceAware<AgentConfigurationModel> =
  AgentConfigurationModel;

makeScript({}, async ({ execute }, logger) => {
  const agents = await AgentConfigurationModelWithBypass.findAll({
    where: {
      providerId: "anthropic",
      modelId: CLAUDE_SONNET_4_6_MODEL_ID,
      status: "active",
    },
    // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  logger.info(
    {
      count: agents.length,
      from: CLAUDE_SONNET_4_6_MODEL_ID,
      to: AUTO_MODEL_ID,
    },
    `Found ${agents.length} active agents on the previous default Sonnet 4.6, migrating to "auto".`
  );

  for (const agent of agents) {
    logger.info(
      {
        sId: agent.sId,
        version: agent.version,
        workspaceId: agent.workspaceId,
      },
      `Migrating agent ${agent.sId} (version ${agent.version}) to "auto".`
    );

    if (execute) {
      await agent.update({
        providerId: AUTO_PROVIDER_ID,
        modelId: AUTO_MODEL_ID,
      });
    }
  }

  logger.info("Migration complete.");
});
