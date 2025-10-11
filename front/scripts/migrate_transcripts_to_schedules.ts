import { WorkflowNotFoundError } from "@temporalio/client";

import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { launchRetrieveTranscriptsWorkflow } from "@app/temporal/labs/transcripts/client";
import { makeRetrieveTranscriptWorkflowId } from "@app/temporal/labs/transcripts/utils";

type MigrationStatus = {
  configSId: string;
  workspaceId: number;
  workspaceName: string;
  provider: string;
  isActive: boolean;
  hasDataSource: boolean;
  workflowId: string;
  oldWorkflowStatus:
    | "running"
    | "not_found"
    | "terminated"
    | "failed"
    | "continued_as_new"
    | "unknown";
  migrationStatus: "success" | "failed" | "skipped";
  error?: string;
};

async function checkOldWorkflowStatus(
  config: LabsTranscriptsConfigurationResource,
  logger: Logger
): Promise<"running" | "not_found" | "terminated" | "failed" | "continued_as_new" | "unknown"> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeRetrieveTranscriptWorkflowId(config);

  try {
    const handle = client.workflow.getHandle(workflowId);
    const description = await handle.describe();

    // Note: A workflow that has called continueAsNew will have status "RUNNING"
    // with a new runId. The getHandle() call returns the current/latest run.
    if (description.status.name === "RUNNING") {
      logger.info(
        {
          workflowId,
          runId: description.runId,
          historyLength: description.historyLength,
        },
        "Found running workflow (may have been continued)"
      );
      return "running";
    } else if (description.status.name === "TERMINATED") {
      return "terminated";
    } else if (description.status.name === "FAILED") {
      return "failed";
    } else if (description.status.name === "CONTINUED_AS_NEW") {
      return "continued_as_new";
    } else {
      return "unknown";
    }
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      return "not_found";
    }
    logger.error(
      {
        error: e,
        workflowId,
        configSId: config.sId,
      },
      "Error checking old workflow status"
    );
    return "unknown";
  }
}

async function terminateOldWorkflow(
  config: LabsTranscriptsConfigurationResource,
  logger: Logger
): Promise<boolean> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeRetrieveTranscriptWorkflowId(config);

  try {
    const handle = client.workflow.getHandle(workflowId);
    const description = await handle.describe();

    // Terminate the current run (even if it was continued via continueAsNew)
    await handle.terminate("Migrating to Temporal Schedules");

    logger.info(
      {
        workflowId,
        runId: description.runId,
        configSId: config.sId,
        historyLength: description.historyLength,
      },
      "Terminated old cron workflow"
    );
    return true;
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      // Already not running, that's fine
      logger.info(
        { workflowId, configSId: config.sId },
        "Workflow not found (already stopped)"
      );
      return true;
    }
    logger.error(
      {
        error: e,
        workflowId,
        configSId: config.sId,
      },
      "Failed to terminate old workflow"
    );
    return false;
  }
}

async function migrateConfiguration(
  config: LabsTranscriptsConfigurationResource,
  workspace: { id: number; name: string },
  execute: boolean,
  logger: Logger
): Promise<MigrationStatus> {
  const baseStatus: Omit<
    MigrationStatus,
    "oldWorkflowStatus" | "migrationStatus"
  > = {
    configSId: config.sId,
    workspaceId: config.workspaceId,
    workspaceName: workspace.name,
    provider: config.provider,
    isActive: config.isActive,
    hasDataSource: config.dataSourceViewId !== null,
    workflowId: makeRetrieveTranscriptWorkflowId(config),
  };

  // Check old workflow status
  const oldWorkflowStatus = await checkOldWorkflowStatus(config, logger);

  // Only migrate if configuration is active or has a data source
  if (!config.isActive && !config.dataSourceViewId) {
    return {
      ...baseStatus,
      oldWorkflowStatus,
      migrationStatus: "skipped",
      error: "Configuration is not active and has no data source",
    };
  }

  if (!execute) {
    // Dry run - just report what would happen
    return {
      ...baseStatus,
      oldWorkflowStatus,
      migrationStatus: "success",
    };
  }

  // Step 1: Terminate old cron workflow if running
  if (oldWorkflowStatus === "running") {
    const terminated = await terminateOldWorkflow(config, logger);
    if (!terminated) {
      return {
        ...baseStatus,
        oldWorkflowStatus,
        migrationStatus: "failed",
        error: "Failed to terminate old workflow",
      };
    }
  }

  // Step 2: Create new schedule
  const result = await launchRetrieveTranscriptsWorkflow(config);

  if (result.isErr()) {
    return {
      ...baseStatus,
      oldWorkflowStatus,
      migrationStatus: "failed",
      error: result.error.message,
    };
  }

  return {
    ...baseStatus,
    oldWorkflowStatus,
    migrationStatus: "success",
  };
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description:
        "Optional workspace ID (numeric) to filter by. If not provided, migrates all workspaces.",
    },
    provider: {
      type: "string",
      description:
        "Optional provider filter (e.g., 'gong', 'modjo', 'google_drive'). If not provided, migrates all providers.",
    },
  },
  async ({ execute, workspaceId, provider }, logger) => {
    logger.info("\n🔄 MIGRATING TRANSCRIPT WORKFLOWS TO TEMPORAL SCHEDULES\n");
    logger.info(
      "This script will:\n" +
        "  1. Find all transcript configurations that are active OR have a data source\n" +
        "  2. Terminate their old cron-based workflows (if running)\n" +
        "  3. Create new Temporal Schedules for them\n"
    );

    // Get all workspaces or filter by specific workspace
    let workspaces: { id: number; name: string }[];
    if (workspaceId) {
      const ws = await WorkspaceResource.fetchById(workspaceId);
      if (!ws) {
        logger.error({ workspaceId }, "Workspace not found");
        return;
      }
      workspaces = [{ id: ws.id, name: ws.name }];
      logger.info(`📍 Filtering by workspace: ${ws.name} (ID: ${ws.id})`);
    } else {
      const allWorkspaces = await WorkspaceResource.listAll();
      workspaces = allWorkspaces.map((ws) => ({ id: ws.id, name: ws.name }));
      logger.info(`📍 Checking all workspaces (${workspaces.length} total)`);
    }

    if (provider) {
      logger.info(`📍 Filtering by provider: ${provider}`);
    }

    // Collect all configurations to migrate
    const configsToMigrate: Array<{
      config: LabsTranscriptsConfigurationResource;
      workspace: { id: number; name: string };
    }> = [];

    for (const workspace of workspaces) {
      const configs =
        await LabsTranscriptsConfigurationResource.findByWorkspaceId(
          workspace.id
        );

      for (const config of configs) {
        // Migrate if configuration is active OR has a data source (for storage-only configs)
        if (config.isActive || config.dataSourceViewId !== null) {
          // Filter by provider if specified
          if (provider && config.provider !== provider) {
            continue;
          }
          configsToMigrate.push({ config, workspace });
        }
      }
    }

    logger.info(
      `\n✅ Found ${configsToMigrate.length} configuration(s) to migrate\n`
    );

    if (configsToMigrate.length === 0) {
      logger.info("No configurations found to migrate. Nothing to do.");
      return;
    }

    // Show what will be migrated
    logger.info("📋 CONFIGURATIONS TO MIGRATE:");
    logger.info("─".repeat(80));
    for (const { config, workspace } of configsToMigrate) {
      const processing = config.isActive ? "✓" : "✗";
      const storing = config.dataSourceViewId ? "✓" : "✗";
      logger.info(
        `  • ${workspace.name} | ${config.provider} | Config: ${config.sId}`
      );
      logger.info(`    Processing: ${processing} | Storing: ${storing}`);
    }
    logger.info("─".repeat(80));

    if (!execute) {
      logger.info("\n🔸 DRY RUN MODE - No changes will be made");
      logger.info("   Run with --execute to perform the migration\n");
      process.exit(0);
    }

    logger.info("\n🚀 Starting migration...\n");

    // Migrate each configuration
    const statuses: MigrationStatus[] = [];

    for (const { config, workspace } of configsToMigrate) {
      logger.info(`\n⏳ Migrating ${workspace.name} (${config.provider})...`);
      const status = await migrateConfiguration(
        config,
        workspace,
        execute,
        logger
      );
      statuses.push(status);

      if (status.migrationStatus === "success") {
        logger.info(
          `  ✅ ${workspace.name} (${config.provider}): Migration successful`
        );
      } else if (status.migrationStatus === "skipped") {
        logger.info(
          `  ⏭️  ${workspace.name} (${config.provider}): Skipped - ${status.error}`
        );
      } else {
        logger.info(
          `  ❌ ${workspace.name} (${config.provider}): Failed - ${status.error}`
        );
      }
    }

    // Final summary
    const successCount = statuses.filter(
      (s) => s.migrationStatus === "success"
    ).length;
    const failedCount = statuses.filter(
      (s) => s.migrationStatus === "failed"
    ).length;
    const skippedCount = statuses.filter(
      (s) => s.migrationStatus === "skipped"
    ).length;

    logger.info("\n" + "═".repeat(80));
    logger.info("📊 MIGRATION SUMMARY");
    logger.info("═".repeat(80));
    logger.info(`Total configurations:         ${statuses.length}`);
    logger.info(`✅ Successfully migrated:      ${successCount}`);
    if (skippedCount > 0) {
      logger.info(`⏭️  Skipped:                   ${skippedCount}`);
    }
    if (failedCount > 0) {
      logger.info(`❌ Failed:                     ${failedCount}`);
    }
    logger.info("═".repeat(80));

    // Show breakdown by old workflow status
    logger.info("\n📊 OLD WORKFLOW STATUS BREAKDOWN:");
    logger.info("─".repeat(80));
    const runningTerminated = statuses.filter(
      (s) => s.oldWorkflowStatus === "running"
    ).length;
    const notFound = statuses.filter(
      (s) => s.oldWorkflowStatus === "not_found"
    ).length;
    const terminated = statuses.filter(
      (s) => s.oldWorkflowStatus === "terminated"
    ).length;
    const failed = statuses.filter(
      (s) => s.oldWorkflowStatus === "failed"
    ).length;

    if (runningTerminated > 0) {
      logger.info(`  • Running (terminated):       ${runningTerminated}`);
    }
    if (notFound > 0) {
      logger.info(`  • Not found:                  ${notFound}`);
    }
    if (terminated > 0) {
      logger.info(`  • Already terminated:         ${terminated}`);
    }
    if (failed > 0) {
      logger.info(`  • Failed:                     ${failed}`);
    }
    logger.info("─".repeat(80) + "\n");

    if (failedCount > 0) {
      logger.info(
        "⚠️  Some configurations failed to migrate. Check logs above for details.\n"
      );
      logger.info("Failed configurations:");
      for (const status of statuses.filter(
        (s) => s.migrationStatus === "failed"
      )) {
        logger.info(
          `  • ${status.workspaceName} (${status.provider}): ${status.error}`
        );
      }
      logger.info("");
    } else {
      logger.info("✨ All configurations migrated successfully!\n");
      logger.info(
        "🎉 Your transcript workflows are now using Temporal Schedules!\n"
      );
    }
  }
);
