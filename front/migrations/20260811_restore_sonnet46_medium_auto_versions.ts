import { Op } from "sequelize";

import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { frontSequelize } from "@app/lib/resources/storage";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeScript } from "@app/scripts/helpers";
import { CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// The earlier migration (20260810_migrate_sonnet46_medium_to_auto) mutated the
// active agent configuration row *in place* (via `agent.update`) instead of
// creating a new version. This destroyed the record that these agents ever ran
// on Claude Sonnet 4.6 (medium reasoning): the row kept the same `id` and
// `version`, so its MCP/tool sub-configurations stayed attached, but its model
// history now lies.
//
// This migration rewrites that history into what it should have been. For each
// agent, with `n` the version the previous migration overwrote:
//   - a new archived version `n` is inserted, carrying Claude Sonnet 4.6 with
//     medium reasoning and the original creation time — the state that existed
//     before the previous migration ran;
//   - the mutated row moves to version `n + 1` and its `createdAt` is set to
//     now, so the Auto version stops claiming the Sonnet version's date.
//
// The mutated row is the one that moves up, and the restored Sonnet version is
// inserted as a new row. It has to be that way round — MCP/tool configurations,
// tags, groups and skills are rows in their own tables pointing at the agent
// configuration row `id`, so every version owns a private copy of them and
// moving the mutated version onto a fresh row would strip the live agents of
// their tools.
//
// The restored Sonnet row therefore only carries the scalar columns copied off
// the mutated row (name, instructions, model, temperature, author...): it
// records that the agent ran on Sonnet 4.6 with medium reasoning, but reads as
// having had no tools. Cloning them would mean deep-copying each MCP server
// configuration and its data source / table / project / child agent rows for
// ~43k agents, to decorate an archived version nobody can run. The visible cost
// is that `getAgentConfigurationsWithVersion` returns an empty tool list for
// this version; its callers use the light variants and read name, picture and
// model, so it does not surface today.
//
// Which rows we touch:
//   - the row must be on the Auto meta-model with reasoning effort "none", and
//     be the *first* such version of its agent;
//   - it must be the agent's latest version. Restoring an agent that has gained
//     a version since would mean renumbering that newer version too, and
//     `AgentMessage.agentConfigurationVersion` is joined on `version`, so its
//     messages would end up pointing at a different configuration. Those agents
//     are counted and left alone;
//   - it must have been created before the cutoff below. Auto only became
//     selectable after the previous migration ran, so an Auto version created later
//     is one a user genuinely picked, not one we overwrote.
//
// Re-running is safe: a restored agent has Sonnet 4.6 back at version `n` and
// its Auto row now carries a `createdAt` of "now", past the cutoff.

// From-state that the previous migration overwrote.
const FROM_MODEL_CONFIG = CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG;
const FROM_REASONING_EFFORT = "medium";

// Auto-state written by the previous migration.
const TO_MODEL_ID = AUTO_MODEL_ID;
const TO_REASONING_EFFORT = "none";

// The previous migration ran at roughly this time (ms since epoch), plus the
// grace period after which an Auto version is assumed to be user-chosen rather
// than one the migration overwrote.
const RAN_AT_MS = 1786379966539;
const USER_CHOSEN_AFTER_MS = 2 * 60 * 60 * 1000;

const AgentConfigurationModelWithBypass: ModelStaticWorkspaceAware<AgentConfigurationModel> =
  AgentConfigurationModel;

makeScript(
  {
    batchSize: {
      type: "number",
      default: 200,
      describe: "Number of candidate rows to process per query.",
    },
  },
  async ({ batchSize, execute }, logger) => {
    const cutoff = new Date(RAN_AT_MS + USER_CHOSEN_AFTER_MS);

    logger.info(
      { from: FROM_MODEL_CONFIG.modelId, to: TO_MODEL_ID, cutoff },
      `Restoring a ${FROM_MODEL_CONFIG.modelId} (${FROM_REASONING_EFFORT}) ` +
        `version below the Auto version of agents the previous migration ` +
        `overwrote (Auto versions created before ${cutoff.toISOString()}).`
    );

    let restored = 0;
    let superseded = 0;
    let notFirstAuto = 0;
    let failed = 0;
    let lastId = 0;

    for (;;) {
      // Paginating on `id` is stable: we never change it, and the rows we
      // insert are on Sonnet so they never match this filter.
      const candidates = await AgentConfigurationModelWithBypass.findAll({
        where: {
          providerId: TO_MODEL_ID,
          modelId: TO_MODEL_ID,
          reasoningEffort: TO_REASONING_EFFORT,
          createdAt: { [Op.lt]: cutoff },
          id: { [Op.gt]: lastId },
        },
        order: [["id", "ASC"]],
        limit: batchSize,
        // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
        // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
        dangerouslyBypassWorkspaceIsolationSecurity: true,
      });

      if (candidates.length === 0) {
        break;
      }
      lastId = candidates[candidates.length - 1].id;

      // One query for the version list of every candidate's agent, so we can
      // tell whether the candidate is the first Auto version and the latest
      // version overall.
      const siblings = await AgentConfigurationModelWithBypass.findAll({
        attributes: ["sId", "version", "modelId", "reasoningEffort"],
        where: { sId: { [Op.in]: candidates.map((c) => c.sId) } },
        // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
        // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
        dangerouslyBypassWorkspaceIsolationSecurity: true,
      });

      const siblingsBySId = new Map<string, AgentConfigurationModel[]>();
      for (const sibling of siblings) {
        siblingsBySId.set(sibling.sId, [
          ...(siblingsBySId.get(sibling.sId) ?? []),
          sibling,
        ]);
      }

      for (const candidate of candidates) {
        const versions = siblingsBySId.get(candidate.sId) ?? [];

        const latestVersion = Math.max(...versions.map((v) => v.version));
        if (candidate.version !== latestVersion) {
          superseded += 1;
          logger.info(
            {
              sId: candidate.sId,
              workspaceId: candidate.workspaceId,
              version: candidate.version,
              latestVersion,
            },
            `Agent ${candidate.sId} gained a version since the migration, skipping.`
          );
          continue;
        }

        const firstAutoVersion = Math.min(
          ...versions
            .filter(
              (v) =>
                v.modelId === TO_MODEL_ID &&
                v.reasoningEffort === TO_REASONING_EFFORT
            )
            .map((v) => v.version)
        );
        if (candidate.version !== firstAutoVersion) {
          notFirstAuto += 1;
          logger.info(
            {
              sId: candidate.sId,
              workspaceId: candidate.workspaceId,
              version: candidate.version,
              firstAutoVersion,
            },
            `Agent ${candidate.sId} was already on ${TO_MODEL_ID} at an earlier ` +
              `version, skipping.`
          );
          continue;
        }

        const restoredVersion = candidate.version;
        const autoVersion = restoredVersion + 1;

        logger.info(
          {
            sId: candidate.sId,
            workspaceId: candidate.workspaceId,
            restoredVersion,
            autoVersion,
          },
          `Restoring agent ${candidate.sId}: putting ` +
            `${FROM_MODEL_CONFIG.modelId} (${FROM_REASONING_EFFORT}) back at ` +
            `version ${restoredVersion} and moving Auto to version ` +
            `${autoVersion}, created now.`
        );

        if (!execute) {
          continue;
        }

        const now = new Date();
        // Captured before the update below moves `createdAt` to now.
        const originalCreatedAt = candidate.createdAt;

        try {
          await frontSequelize.transaction(async (transaction) => {
            // 1. Move the mutated row up one version and stamp it as created
            //    now: it becomes the new version layered on top of the restored
            //    history. This also frees its old version number for the insert
            //    below — it is the agent's latest, so version + 1 is unused.
            await candidate.update(
              { version: autoVersion, createdAt: now },
              { transaction }
            );

            // 2. Insert the pre-migration state as an archived version. `id` is
            //    left to autogenerate; `createdAt` is the mutated row's original
            //    value, so the restored version keeps its real creation time.
            await AgentConfigurationModel.create(
              {
                ...candidate.dataValues,
                id: undefined,
                version: restoredVersion,
                status: "archived",
                providerId: FROM_MODEL_CONFIG.providerId,
                modelId: FROM_MODEL_CONFIG.modelId,
                reasoningEffort: FROM_REASONING_EFFORT,
                createdAt: originalCreatedAt,
                updatedAt: now,
              },
              { transaction }
            );
          });

          restored += 1;
        } catch (err) {
          failed += 1;
          logger.error(
            {
              sId: candidate.sId,
              workspaceId: candidate.workspaceId,
              err: normalizeError(err),
            },
            `Failed to restore agent ${candidate.sId}, skipping.`
          );
        }
      }

      logger.info(
        { restored, superseded, notFirstAuto, failed, lastId },
        "Batch complete."
      );
    }

    logger.info(
      { restored, superseded, notFirstAuto, failed, dryRun: !execute },
      execute
        ? `Restoration complete: ${restored} restored, ${superseded} superseded ` +
            `by a newer version, ${notFirstAuto} already on Auto earlier, ` +
            `${failed} failed.`
        : "Dry run complete. Re-run with --execute to apply."
    );
  }
);
