import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeScript } from "@app/scripts/helpers";
import {
  GEMINI_3_1_FLASH_LITE_MODEL_ID,
  GEMINI_3_1_FLASH_LITE_PREVIEW_DEPRECATED_MODEL_ID,
} from "@app/types/assistant/models/google_ai_studio";

// gemini-3.1-flash-lite-preview was deprecated by Google in favour of gemini-3.1-flash-lite.
const MIGRATIONS = [
  {
    from: GEMINI_3_1_FLASH_LITE_PREVIEW_DEPRECATED_MODEL_ID,
    to: GEMINI_3_1_FLASH_LITE_MODEL_ID,
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
