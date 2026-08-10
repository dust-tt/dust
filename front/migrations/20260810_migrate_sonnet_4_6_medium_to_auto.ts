import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeScript } from "@app/scripts/helpers";

// Migrate every active agent explicitly configured on Claude Sonnet 4.6 at
// `medium` reasoning effort to the "Standard" auto-routing meta-model (`auto`).
//
// This moves those agents onto the meta-model so Dust dynamically picks the
// best available model at message-send time. Note this is NOT behavior-
// preserving: the `auto` stream's first candidate is GPT 5.6 Luna (high), so
// migrated agents route there first and fall back through the stream (down to
// Sonnet 4.6 at `light`) when a candidate isn't available to the workspace.
//
// All ids (source and target) are hardcoded on purpose so this migration is a
// frozen snapshot: it keeps working after the configs move in the codebase and
// won't silently change target if the meta-model definition evolves later. The
// `auto` meta-model only supports the `none` reasoning effort, so we clear the
// stored `medium` effort to match its config.
const SOURCE_PROVIDER_ID = "anthropic";
const SOURCE_MODEL_ID = "claude-sonnet-4-6";
const SOURCE_REASONING_EFFORT = "medium";

const TARGET_PROVIDER_ID = "auto";
const TARGET_MODEL_ID = "auto";
const TARGET_REASONING_EFFORT = "none";

const AgentConfigurationModelWithBypass: ModelStaticWorkspaceAware<AgentConfigurationModel> =
  AgentConfigurationModel;

makeScript({}, async ({ execute }, logger) => {
  const agents = await AgentConfigurationModelWithBypass.findAll({
    where: {
      providerId: SOURCE_PROVIDER_ID,
      modelId: SOURCE_MODEL_ID,
      reasoningEffort: SOURCE_REASONING_EFFORT,
      status: "active",
    },
    // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  logger.info(
    { count: agents.length, to: TARGET_MODEL_ID },
    `Found ${agents.length} active agents on ${SOURCE_MODEL_ID} (${SOURCE_REASONING_EFFORT}), migrating to Standard (${TARGET_MODEL_ID}).`
  );

  for (const agent of agents) {
    logger.info(
      {
        sId: agent.sId,
        version: agent.version,
        workspaceId: agent.workspaceId,
        fromProviderId: agent.providerId,
        fromModelId: agent.modelId,
        fromReasoningEffort: agent.reasoningEffort,
      },
      `Migrating agent ${agent.sId} (version ${agent.version}) from ${SOURCE_MODEL_ID} (${SOURCE_REASONING_EFFORT}) to Standard (${TARGET_MODEL_ID}).`
    );
  }

  if (execute && agents.length > 0) {
    // Single batched UPDATE instead of one query per row (GEN14). Scoped to the
    // exact ids gathered above, so no workspace isolation bypass is needed (the
    // cross-workspace scan happened in the findAll).
    await AgentConfigurationModelWithBypass.update(
      {
        providerId: TARGET_PROVIDER_ID,
        modelId: TARGET_MODEL_ID,
        reasoningEffort: TARGET_REASONING_EFFORT,
      },
      { where: { id: agents.map((agent) => agent.id) } }
    );
  }

  logger.info("Migration complete.");
});
