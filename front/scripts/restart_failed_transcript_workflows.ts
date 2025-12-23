import { WorkflowNotFoundError } from "@temporalio/client";

import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { launchRetrieveTranscriptsWorkflow } from "@app/temporal/labs/transcripts/client";
import { makeRetrieveTranscriptWorkflowId } from "@app/temporal/labs/transcripts/utils";

type WorkflowStatus = {
  configSId: string;
  workspaceId: number;
  workspaceName: string;
  provider: string;
  isActive: boolean;
  hasDataSource: boolean;
  workflowId: string;
  status: "running" | "not_found" | "terminated" | "failed" | "unknown";
};

async function checkWorkflowStatus(
  config: LabsTranscriptsConfigurationResource,
  workspace: { name: string; id: number },
  logger: Logger
): Promise<WorkflowStatus> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeRetrieveTranscriptWorkflowId(config);

  const baseStatus: Omit<WorkflowStatus, "status"> = {
    configSId: config.sId,
    workspaceId: config.workspaceId,
    workspaceName: workspace.name,
    provider: config.provider,
    isActive: config.isActive,
    hasDataSource: config.dataSourceViewId !== null,
    workflowId,
  };

  try {
    const handle = client.workflow.getHandle(workflowId);
    const description = await handle.describe();

    // Check if workflow is running
    if (description.status.name === "RUNNING") {
      return { ...baseStatus, status: "running" };
    } else if (description.status.name === "TERMINATED") {
      return { ...baseStatus, status: "terminated" };
    } else if (description.status.name === "FAILED") {
      return { ...baseStatus, status: "failed" };
    } else {
      return { ...baseStatus, status: "unknown" };
    }
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      return { ...baseStatus, status: "not_found" };
    }
    logger.error(
      {
        error: e,
        workflowId,
        configSId: config.sId,
      },
      "Error checking workflow status"
    );
    return { ...baseStatus, status: "unknown" };
  }
}

async function restartFailedWorkflows(
  statuses: WorkflowStatus[],
  execute: boolean,
  logger: Logger
): Promise<{ restarted: number; failed: number }> {
  let restarted = 0;
  let failed = 0;

  for (const status of statuses) {
    if (status.status === "running") {
      continue;
    }

    if (!execute) {
      restarted++;
      continue;
    }

    try {
      // Fetch the config fresh to ensure we have the latest state
      const config = await LabsTranscriptsConfigurationResource.fetchById(
        status.configSId
      );

      if (!config) {
        logger.info(
          `  ❌ ${status.workspaceName} (${status.provider}): Configuration not found`
        );
        failed++;
        continue;
      }

      // Only restart if still active
      if (!config.isActive && !config.dataSourceViewId) {
        logger.info(
          `  ⏭️  ${status.workspaceName} (${status.provider}): No longer active, skipping`
        );
        continue;
      }

      const result = await launchRetrieveTranscriptsWorkflow(config);

      if (result.isErr()) {
        logger.info(
          `  ❌ ${status.workspaceName} (${status.provider}): Failed - ${result.error.message}`
        );
        logger.error(
          {
            configSId: status.configSId,
            error: result.error,
          },
          "Failed to restart workflow"
        );
        failed++;
      } else {
        logger.info(
          `  ✅ ${status.workspaceName} (${status.provider}): Restarted successfully`
        );
        restarted++;
      }
    } catch (e) {
      logger.info(
        `  ❌ ${status.workspaceName} (${status.provider}): Exception - ${e}`
      );
      logger.error(
        {
          configSId: status.configSId,
          error: e,
        },
        "Exception while restarting workflow"
      );
      failed++;
    }
  }

  return { restarted, failed };
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description:
        "Optional workspace ID (numeric) to filter by. If not provided, checks all workspaces.",
    },
    provider: {
      type: "string",
      description:
        "Optional provider filter (e.g., 'gong', 'modjo', 'google'). If not provided, checks all providers.",
    },
  },
  async ({ execute, workspaceId, provider }, logger) => {
    logger.info("\n🔍 Scanning for failed transcript workflows...\n");

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

    // Collect all active configurations
    const activeConfigs: Array<{
      config: LabsTranscriptsConfigurationResource;
      workspace: { id: number; name: string };
    }> = [];

    for (const workspace of workspaces) {
      const configs =
        await LabsTranscriptsConfigurationResource.findByWorkspaceId(
          workspace.id
        );

      for (const config of configs) {
        // Check if configuration is active (processing or storing)
        if (config.isActive || config.dataSourceViewId !== null) {
          // Filter by provider if specified
          if (provider && config.provider !== provider) {
            continue;
          }
          activeConfigs.push({ config, workspace });
        }
      }
    }

    logger.info(
      `\n✅ Found ${activeConfigs.length} active transcript configuration(s)\n`
    );

    if (activeConfigs.length === 0) {
      logger.info("No active transcript configurations found. Nothing to do.");
      return;
    }

    // Check workflow status for each config
    logger.info("⏳ Checking workflow statuses...\n");
    const statuses: WorkflowStatus[] = [];

    for (const { config, workspace } of activeConfigs) {
      const status = await checkWorkflowStatus(config, workspace, logger);
      statuses.push(status);
    }

    // Summarize findings
    const runningCount = statuses.filter((s) => s.status === "running").length;
    const notFoundCount = statuses.filter(
      (s) => s.status === "not_found"
    ).length;
    const terminatedCount = statuses.filter(
      (s) => s.status === "terminated"
    ).length;
    const failedCount = statuses.filter((s) => s.status === "failed").length;
    const unknownCount = statuses.filter((s) => s.status === "unknown").length;

    // Restart workflows that are not running
    const needsRestart = statuses.filter((s) => s.status !== "running");

    // Print summary
    logger.info("📊 WORKFLOW STATUS SUMMARY");
    logger.info("═".repeat(80));
    logger.info(`Total configurations checked:  ${statuses.length}`);
    logger.info(
      `✅ Running:                      ${runningCount} ${runningCount === statuses.length ? "🎉" : ""}`
    );
    if (notFoundCount > 0) {
      logger.info(`❌ Not found (never started):    ${notFoundCount}`);
    }
    if (terminatedCount > 0) {
      logger.info(`🛑 Terminated:                   ${terminatedCount}`);
    }
    if (failedCount > 0) {
      logger.info(`💥 Failed:                       ${failedCount}`);
    }
    if (unknownCount > 0) {
      logger.info(`❓ Unknown status:               ${unknownCount}`);
    }
    logger.info("═".repeat(80));

    if (needsRestart.length === 0) {
      logger.info("\n✨ All workflows are already running. Nothing to do!\n");
      return;
    }

    logger.info(
      `\n⚠️  ${needsRestart.length} workflow(s) need to be restarted\n`
    );

    // Show details of workflows to restart
    logger.info("📋 WORKFLOWS TO RESTART:");
    logger.info("─".repeat(80));
    for (const status of needsRestart) {
      const processing = status.isActive ? "✓" : "✗";
      const storing = status.hasDataSource ? "✓" : "✗";
      logger.info(
        `  • ${status.workspaceName} | ${status.provider} | Status: ${status.status}`
      );
      logger.info(
        `    Processing: ${processing} | Storing: ${storing} | Config: ${status.configSId}`
      );
    }
    logger.info("─".repeat(80));

    if (!execute) {
      logger.info("\n🔸 DRY RUN MODE - No changes will be made");
      logger.info(
        "   Run with --execute to actually restart these workflows\n"
      );
      // Exit without triggering the default "Script was not executed" warning
      process.exit(0);
    }

    logger.info("\n🚀 Restarting workflows...\n");

    const { restarted, failed } = await restartFailedWorkflows(
      needsRestart,
      execute,
      logger
    );

    // Final summary
    logger.info("\n" + "═".repeat(80));
    logger.info("📊 RESTART SUMMARY");
    logger.info("═".repeat(80));
    logger.info(`Total workflows to restart:  ${needsRestart.length}`);
    logger.info(`✅ Successfully restarted:    ${restarted}`);
    if (failed > 0) {
      logger.info(`❌ Failed to restart:         ${failed}`);
    }
    logger.info("═".repeat(80) + "\n");

    if (failed > 0) {
      logger.info(
        "⚠️  Some workflows failed to restart. Check logs above for details.\n"
      );
    } else {
      logger.info("✨ All workflows restarted successfully!\n");
    }
  }
);
