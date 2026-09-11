import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeScript } from "@app/scripts/helpers";

// Fireworks decommissions the `kimi-k2p6` serverless endpoint on 2026-09-25
// (announced by email), so every agent still pointing at it will fail on each
// run after that date. Kimi K3 is the Moonshot-named successor.
//
// Both model ids are hardcoded on purpose so this migration is a frozen
// snapshot: it keeps working once the K2.6 config is removed from the codebase,
// and won't silently change target if the "latest Kimi model" pointer moves.
const FROM_MODEL_ID = "accounts/fireworks/models/kimi-k2p6";
const TO_MODEL_ID = "accounts/fireworks/models/kimi-k3";

// K2.6 thinking is binary (on/off), so none/light/medium/high all collapsed to
// "thinking on or off" — there is no graded behavior to preserve here, unlike
// the GLM-5.2 -> GLM-5.3 migration.
//
// What we must preserve is *runnability*. K2.6 is `balanced` at every effort
// (model_tiers.ts), while K3 is `balanced` at `light` and `premium` at
// medium/high. `checkModelTierAccess` denies a run whose tier is above the
// member's cap, so mapping to medium/high would break every agent in a
// workspace without premium access — and cost 4x input / 4.7x output
// ($0.95/$4.00 -> $3.75/$18.75 per 1M) for the ones that still run.
//
// `light` also absorbs the stored `none` rows: K3 has no `none` (it always
// thinks), and `resolveModel` would fall back to its `defaultReasoningEffort`,
// which is `light` anyway. Setting it explicitly keeps the stored value honest.
const TO_REASONING_EFFORT = "light";

// `active` rows only, so version history keeps showing the model each version
// actually ran on. Known gap: `restoreAgentConfiguration` un-archives the
// latest row in place rather than writing a new version
// (lib/api/assistant/configuration/agent.ts), so an agent deleted before this
// migration and restored after 2026-09-25 comes back on a model Fireworks no
// longer serves. Re-run this script (dropping the status filter) if that shows
// up in support.
const AgentConfigurationModelWithBypass: ModelStaticWorkspaceAware<AgentConfigurationModel> =
  AgentConfigurationModel;

makeScript({}, async ({ execute }, logger) => {
  const agents = await AgentConfigurationModelWithBypass.findAll({
    where: {
      modelId: FROM_MODEL_ID,
      status: "active",
    },
    // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  const countByReasoningEffort = agents.reduce<Record<string, number>>(
    (acc, agent) => {
      const effort = agent.reasoningEffort ?? "null";
      acc[effort] = (acc[effort] ?? 0) + 1;
      return acc;
    },
    {}
  );

  logger.info(
    {
      count: agents.length,
      countByReasoningEffort,
      from: FROM_MODEL_ID,
      to: TO_MODEL_ID,
      reasoningEffort: TO_REASONING_EFFORT,
    },
    `Found ${agents.length} agent configurations on ${FROM_MODEL_ID}, migrating to ${TO_MODEL_ID}.`
  );

  for (const agent of agents) {
    logger.info(
      {
        sId: agent.sId,
        version: agent.version,
        workspaceId: agent.workspaceId,
        fromReasoningEffort: agent.reasoningEffort,
      },
      `Migrating agent ${agent.sId} (version ${agent.version}) from ${FROM_MODEL_ID} to ${TO_MODEL_ID}.`
    );
  }

  if (execute && agents.length > 0) {
    // Single batched UPDATE instead of one query per row
    // (batch-database-queries). Scoped to the exact ids gathered above, so no
    // workspace isolation bypass is needed (the cross-workspace scan happened
    // in the findAll).
    await AgentConfigurationModelWithBypass.update(
      {
        modelId: TO_MODEL_ID,
        reasoningEffort: TO_REASONING_EFFORT,
      },
      { where: { id: agents.map((agent) => agent.id) } }
    );
  }

  logger.info("Migration complete.");
});
