import type { Logger } from "pino";
import { z } from "zod";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType, SuggestionPayload } from "@app/types";
import {
  isSkillsSuggestion,
  isToolsSuggestion,
} from "@app/types/suggestions/agent_suggestion";

/**
 * This migration converts tool and skill suggestions from the legacy format
 * (arrays of additions/deletions) to the new single-item format (action + toolId/skillId).
 *
 * For each legacy suggestion with multiple items, we create multiple new suggestions.
 * The old suggestion is deleted and new ones are created.
 *
 * Legacy tools format:
 * { additions: [{ id: "toolId", additionalConfiguration?: {} }], deletions: ["toolId"] }
 *
 * New tools format:
 * { action: "add" | "remove", toolId: "toolId", additionalConfiguration?: {} }
 *
 * Legacy skills format:
 * { additions: ["skillId"], deletions: ["skillId"] }
 *
 * New skills format:
 * { action: "add" | "remove", skillId: "skillId" }
 */

// Legacy schemas for validation.
const LegacyToolAdditionSchema = z.object({
  id: z.string(),
  additionalConfiguration: z.record(z.unknown()).optional(),
});

const LegacyToolsSuggestionSchema = z.object({
  additions: z.array(LegacyToolAdditionSchema).optional(),
  deletions: z.array(z.string()).optional(),
});

const LegacySkillsSuggestionSchema = z.object({
  additions: z.array(z.string()).optional(),
  deletions: z.array(z.string()).optional(),
});

function isLegacyToolsSuggestion(data: unknown): boolean {
  const result = LegacyToolsSuggestionSchema.safeParse(data);
  if (!result.success) {
    return false;
  }
  // Check it's actually in the legacy format (has additions or deletions arrays).
  return "additions" in result.data || "deletions" in result.data;
}

function isLegacySkillsSuggestion(data: unknown): boolean {
  const result = LegacySkillsSuggestionSchema.safeParse(data);
  if (!result.success) {
    return false;
  }
  // Check it's actually in the legacy format (has additions or deletions arrays).
  return "additions" in result.data || "deletions" in result.data;
}

interface MigrationResult {
  processed: number;
  deleted: number;
  created: number;
  skipped: number;
  errors: number;
}

async function migrateWorkspaceSuggestions(
  workspace: LightWorkspaceType,
  {
    execute,
    logger: parentLogger,
  }: {
    execute: boolean;
    logger: Logger;
  }
): Promise<MigrationResult> {
  const logger = parentLogger.child({ workspaceId: workspace.sId });
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const result: MigrationResult = {
    processed: 0,
    deleted: 0,
    created: 0,
    skipped: 0,
    errors: 0,
  };

  // Fetch all suggestions and filter by kind.
  const allWorkspaceSuggestions = await AgentSuggestionResource.listAll(auth);
  const allSuggestions = allWorkspaceSuggestions.filter(
    (s) => s.kind === "tools" || s.kind === "skills"
  );

  if (allSuggestions.length === 0) {
    return result;
  }

  logger.info(
    {
      count: allSuggestions.length,
    },
    "Found suggestions to process"
  );

  for (const suggestion of allSuggestions) {
    result.processed++;

    try {
      if (suggestion.kind === "tools") {
        // Check if already in new format.
        if (isToolsSuggestion(suggestion.suggestion)) {
          logger.info(
            { id: suggestion.id, kind: "tools" },
            "Already in new format, skipping"
          );
          result.skipped++;
          continue;
        }

        // Validate it's in legacy format.
        if (!isLegacyToolsSuggestion(suggestion.suggestion)) {
          logger.error(
            { id: suggestion.id, suggestion: suggestion.suggestion },
            "Unknown tools suggestion format"
          );
          result.errors++;
          continue;
        }

        const legacyData = LegacyToolsSuggestionSchema.parse(
          suggestion.suggestion
        );
        const additions = legacyData.additions ?? [];
        const deletions = legacyData.deletions ?? [];

        // Build all new suggestions.
        const newSuggestions: Array<SuggestionPayload> = [];

        for (const addition of additions) {
          newSuggestions.push({
            action: "add",
            toolId: addition.id,
            ...(addition.additionalConfiguration && {
              additionalConfiguration: addition.additionalConfiguration,
            }),
          });
        }

        for (const deletion of deletions) {
          newSuggestions.push({
            action: "remove",
            toolId: deletion,
          });
        }

        logger.info(
          {
            id: suggestion.id,
            oldFormat: legacyData,
            newSuggestionsCount: newSuggestions.length,
          },
          "Migrating tools suggestion"
        );

        if (execute) {
          // Get agent configuration to create new suggestions.
          const agentConfig = await getAgentConfiguration(auth, {
            agentId: suggestion.agentConfigurationSId,
            variant: "light",
          });

          if (!agentConfig) {
            logger.error(
              { agentSId: suggestion.agentConfigurationSId },
              "Agent configuration not found, skipping"
            );
            result.errors++;
            continue;
          }

          // Wrap delete + create in a transaction.
          await withTransaction(async (transaction) => {
            // Delete old suggestion.
            await suggestion.delete(auth, { transaction });
            result.deleted++;

            // Create new suggestions.
            for (const newSuggestion of newSuggestions) {
              await AgentSuggestionResource.createSuggestionForAgent(
                auth,
                agentConfig,
                {
                  kind: "tools",
                  suggestion: newSuggestion,
                  analysis: suggestion.analysis,
                  state: suggestion.state,
                  source: suggestion.source,
                },
                { transaction }
              );
              result.created++;
            }
          });
        } else {
          result.deleted++;
          result.created += newSuggestions.length;
        }
      } else if (suggestion.kind === "skills") {
        // Check if already in new format.
        if (isSkillsSuggestion(suggestion.suggestion)) {
          logger.info(
            { id: suggestion.id, kind: "skills" },
            "Already in new format, skipping"
          );
          result.skipped++;
          continue;
        }

        // Validate it's in legacy format.
        if (!isLegacySkillsSuggestion(suggestion.suggestion)) {
          logger.error(
            { id: suggestion.id, suggestion: suggestion.suggestion },
            "Unknown skills suggestion format"
          );
          result.errors++;
          continue;
        }

        const legacyData = LegacySkillsSuggestionSchema.parse(
          suggestion.suggestion
        );
        const additions = legacyData.additions ?? [];
        const deletions = legacyData.deletions ?? [];

        // Build all new suggestions.
        const newSuggestions: Array<{
          action: "add" | "remove";
          skillId: string;
        }> = [];

        for (const addition of additions) {
          newSuggestions.push({
            action: "add",
            skillId: addition,
          });
        }

        for (const deletion of deletions) {
          newSuggestions.push({
            action: "remove",
            skillId: deletion,
          });
        }

        logger.info(
          {
            id: suggestion.id,
            oldFormat: legacyData,
            newSuggestionsCount: newSuggestions.length,
          },
          "Migrating skills suggestion"
        );

        if (execute) {
          // Get agent configuration to create new suggestions.
          const agentConfig = await getAgentConfiguration(auth, {
            agentId: suggestion.agentConfigurationSId,
            variant: "light",
          });

          if (!agentConfig) {
            logger.error(
              { agentSId: suggestion.agentConfigurationSId },
              "Agent configuration not found, skipping"
            );
            result.errors++;
            continue;
          }

          // Wrap delete + create in a transaction.
          await withTransaction(async (transaction) => {
            // Delete old suggestion.
            await suggestion.delete(auth, { transaction });
            result.deleted++;

            // Create new suggestions.
            for (const newSuggestion of newSuggestions) {
              await AgentSuggestionResource.createSuggestionForAgent(
                auth,
                agentConfig,
                {
                  kind: "skills",
                  suggestion: newSuggestion,
                  analysis: suggestion.analysis,
                  state: suggestion.state,
                  source: suggestion.source,
                },
                { transaction }
              );
              result.created++;
            }
          });
        } else {
          result.deleted++;
          result.created += newSuggestions.length;
        }
      }
    } catch (error) {
      logger.error(
        { id: suggestion.id, error: String(error) },
        "Error migrating suggestion"
      );
      result.errors++;
    }
  }

  return result;
}

makeScript(
  {
    workspaceId: { type: "string", required: false },
  },
  async ({ workspaceId, execute }, logger) => {
    logger.info("Starting tools/skills suggestion format migration");

    const totals: MigrationResult = {
      processed: 0,
      deleted: 0,
      created: 0,
      skipped: 0,
      errors: 0,
    };

    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      const result = await migrateWorkspaceSuggestions(
        renderLightWorkspaceType({ workspace }),
        { execute, logger }
      );
      totals.processed += result.processed;
      totals.deleted += result.deleted;
      totals.created += result.created;
      totals.skipped += result.skipped;
      totals.errors += result.errors;
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          const result = await migrateWorkspaceSuggestions(workspace, {
            execute,
            logger,
          });
          totals.processed += result.processed;
          totals.deleted += result.deleted;
          totals.created += result.created;
          totals.skipped += result.skipped;
          totals.errors += result.errors;
        },
        { concurrency: 2 }
      );
    }

    logger.info(
      {
        processed: totals.processed,
        deleted: totals.deleted,
        created: totals.created,
        skipped: totals.skipped,
        errors: totals.errors,
      },
      "Migration completed"
    );

    if (totals.errors > 0) {
      logger.warn("Some suggestions could not be migrated, check logs above");
    }
  }
);
