import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeScript } from "@app/scripts/helpers";

// Fireworks decommissions the `glm-5p2` serverless endpoint on 2026-09-25
// (announced by email), so every agent still pointing at it will fail on each
// run after that date. GLM-5.3 is the replacement Z.ai and Fireworks both name,
// at identical pricing ($1.40/$4.40/$0.26 per 1M) and the same `balanced` tier.
//
// Both model ids are hardcoded on purpose so this migration is a frozen
// snapshot: it keeps working once the GLM-5.2 config is removed from the
// codebase, and won't silently change target if the "latest GLM model" pointer
// moves later.
const PROVIDER_ID = "fireworks";
const FROM_MODEL_ID = "accounts/fireworks/models/glm-5p2";
const TO_MODEL_ID = "accounts/fireworks/models/glm-5p3";

// GLM-5.2 supports `high` as its only effort, so every other stored value was
// clamped up to it on each send (`getMinimumReasoningEffort`, transitionLLM):
// prod holds light/medium/high rows that all ran at Z.ai's native `high`.
// GLM-5.3 exposes the full ladder, on which Z.ai's `high` is our `medium`
// (`mapReasoningEffortToLowHighMax`: light -> low, medium -> high, high -> max).
// So `medium` is what preserves behavior for every row regardless of its
// current value — `light` would buy them less reasoning than they have today,
// and `high` would move them onto Z.ai `max` at $4.40/1M output.
const TO_REASONING_EFFORT = "medium";

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
        providerId: PROVIDER_ID,
        modelId: TO_MODEL_ID,
        reasoningEffort: TO_REASONING_EFFORT,
      },
      { where: { id: agents.map((agent) => agent.id) } }
    );
  }

  logger.info("Migration complete.");
});
