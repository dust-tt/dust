// DISABLED — kept as a historical record, do not re-run.
//
// This migration repointed agents from the `deepseek-v4-pro` preview onto
// `deepseek-v4-pro-0813`. It ran on 2026-09-07 and has since been superseded:
// `deepseek-v4-pro-0813` was itself decommissioned and removed from the
// codebase, so `modelId` no longer type-checks against `ModelIdType` and
// re-running this would strand agents on a model Fireworks no longer serves.
// `20260911_migrate_deepseek_v4_to_v4p1_flash` repoints them onto V4.1 Flash.
//
// The original body is preserved verbatim below.

// import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
// import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
// import { makeScript } from "@app/scripts/helpers";
//
// // Fireworks pulled the `deepseek-v4-pro` preview from serverless: it is now
// // on-demand dedicated only, so every agent still pointing at it fails on each
// // run. DeepSeek released `deepseek-v4-pro-0813` as its replacement, with the
// // same 1M context and the same behavior on the wire.
// //
// // Both model ids are hardcoded on purpose so this migration is a frozen
// // snapshot: it keeps working once the preview config is removed from the
// // codebase, and won't silently change target if the "latest DeepSeek model"
// // pointer moves later.
// const PROVIDER_ID = "fireworks";
// const FROM_MODEL_ID = "accounts/fireworks/models/deepseek-v4-pro";
// const TO_MODEL_ID = "accounts/fireworks/models/deepseek-v4-pro-0813";
//
// // The preview declared `none` as its only effort because reasoning was never
// // wired up for it (#24934); `none` omitted `reasoning_effort` and Fireworks
// // fell back to its `high` default, so every request already ran at DeepSeek's
// // `high`. 0813 exposes the full ladder, on which DeepSeek's `high` is our
// // `medium` (`mapReasoningEffortToLowHighMax`: light -> low, medium -> high,
// // high -> max). So `medium` is what preserves behavior — `high` would move
// // every migrated agent onto DeepSeek `max`, buying them more reasoning tokens
// // at $3.96/1M output that nobody asked for.
// const TO_REASONING_EFFORT = "medium";
//
// // Every status, not just `active`. `archived` covers both superseded versions
// // and deleted agents, and `restoreAgentConfiguration` un-archives the latest
// // row in place rather than writing a new one — so a deleted agent restored
// // after this migration would otherwise come back pointing at a model Fireworks
// // no longer serves. `draft`/`pending` are builder rows that the "try" button
// // runs. No row on a decommissioned model is worth keeping.
// const AgentConfigurationModelWithBypass: ModelStaticWorkspaceAware<AgentConfigurationModel> =
//   AgentConfigurationModel;
//
// makeScript({}, async ({ execute }, logger) => {
//   const agents = await AgentConfigurationModelWithBypass.findAll({
//     where: {
//       modelId: FROM_MODEL_ID,
//     },
//     // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
//     // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
//     dangerouslyBypassWorkspaceIsolationSecurity: true,
//   });
//
//   const countByStatus = agents.reduce<Record<string, number>>((acc, agent) => {
//     acc[agent.status] = (acc[agent.status] ?? 0) + 1;
//     return acc;
//   }, {});
//
//   logger.info(
//     {
//       count: agents.length,
//       countByStatus,
//       from: FROM_MODEL_ID,
//       to: TO_MODEL_ID,
//       reasoningEffort: TO_REASONING_EFFORT,
//     },
//     `Found ${agents.length} agent configurations on ${FROM_MODEL_ID}, migrating to ${TO_MODEL_ID}.`
//   );
//
//   for (const agent of agents) {
//     logger.info(
//       {
//         sId: agent.sId,
//         version: agent.version,
//         // `status` is reserved by our log infra (it types as a severity), so
//         // the agent's own status ships under a prefixed key.
//         agentStatus: agent.status,
//         workspaceId: agent.workspaceId,
//         fromReasoningEffort: agent.reasoningEffort,
//       },
//       `Migrating agent ${agent.sId} (version ${agent.version}, ${agent.status}) from ${FROM_MODEL_ID} to ${TO_MODEL_ID}.`
//     );
//   }
//
//   if (execute && agents.length > 0) {
//     // Single batched UPDATE instead of one query per row
//     // (batch-database-queries). Scoped to the exact ids gathered above, so no
//     // workspace isolation bypass is needed (the cross-workspace scan happened
//     // in the findAll).
//     await AgentConfigurationModelWithBypass.update(
//       {
//         providerId: PROVIDER_ID,
//         modelId: TO_MODEL_ID,
//         reasoningEffort: TO_REASONING_EFFORT,
//       },
//       { where: { id: agents.map((agent) => agent.id) } }
//     );
//   }
//
//   logger.info("Migration complete.");
// });
