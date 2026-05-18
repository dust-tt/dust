import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeScript } from "@app/scripts/helpers";
import {
  CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
  CLAUDE_3_HAIKU_20240307_MODEL_ID,
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
  CLAUDE_4_OPUS_20250514_MODEL_ID,
  CLAUDE_4_SONNET_20250514_MODEL_ID,
  CLAUDE_OPUS_4_7_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
} from "@app/types/assistant/models/anthropic";

// Models officially deprecated by Anthropic as of April 14, 2026 (retire June 15, 2026),
// plus retired haiku models (retired Feb–Apr 2026), and claude-sonnet-4-5 superseded by 4.6.
const MIGRATIONS = [
  { from: CLAUDE_4_SONNET_20250514_MODEL_ID, to: CLAUDE_SONNET_4_6_MODEL_ID },
  { from: CLAUDE_4_OPUS_20250514_MODEL_ID, to: CLAUDE_OPUS_4_7_MODEL_ID },
  { from: CLAUDE_4_5_SONNET_20250929_MODEL_ID, to: CLAUDE_SONNET_4_6_MODEL_ID },
  {
    from: CLAUDE_3_HAIKU_20240307_MODEL_ID,
    to: CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  },
  {
    from: CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
    to: CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  },
] as const;

const AgentConfigurationModelWithBypass: ModelStaticWorkspaceAware<AgentConfigurationModel> =
  AgentConfigurationModel;

makeScript({}, async ({ execute }, logger) => {
  for (const { from, to } of MIGRATIONS) {
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
      { count: agents.length, from, to },
      `Found ${agents.length} active agents on ${from}, migrating to ${to}.`
    );

    for (const agent of agents) {
      logger.info(
        {
          sId: agent.sId,
          version: agent.version,
          workspaceId: agent.workspaceId,
        },
        `Migrating agent ${agent.sId} (version ${agent.version}) from ${from} to ${to}.`
      );

      if (execute) {
        await agent.update({ modelId: to });
      }
    }
  }

  logger.info("Migration complete.");
});
