import { createPlugin } from "@app/lib/api/poke/types";
import { config } from "@app/lib/api/regions/config";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { LabsTranscriptsHistoryModel } from "@app/lib/resources/storage/models/labs_transcripts";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  launchRetrieveTranscriptsWorkflow,
  stopRetrieveTranscriptsWorkflow,
} from "@app/temporal/labs/transcripts/client";
import { Err, Ok } from "@app/types";

export const deleteLabsTranscriptHistoriesPlugin = createPlugin({
  manifest: {
    id: "delete-labs-transcript-histories",
    name: "Transcripts Full Resync",
    description:
      "Delete all labs_conversation_histories for a specific transcriptsConfiguration to restart sync",
    resourceTypes: ["workspaces"],
    args: {
      transcriptsConfigurationId: {
        type: "enum",
        label: "Transcripts Configuration",
        description:
          "Select the transcripts configuration to delete all history for",
        async: true,
        multiple: false,
        values: [],
      },
    },
  },
  populateAsyncArgs: async (auth) => {
    const workspace = auth.getNonNullableWorkspace();
    const configurations =
      await LabsTranscriptsConfigurationResource.findByWorkspaceId(
        workspace.id
      );

    // Build enum values with detailed information
    const options = await concurrentExecutor(
      configurations,
      async (config) => {
        const hasHistory = await config.hasAnyHistory();
        const mostRecentDate = await config.getMostRecentHistoryDate();
        const user = await config.getUser();

        // Check if datasource exists
        let datasourceInfo = "No datasource";
        if (config.dataSourceViewId) {
          const [dsv] = await DataSourceViewResource.fetchByModelIds(auth, [
            config.dataSourceViewId,
          ]);
          datasourceInfo = dsv ? `DS: ${dsv.dataSource.name}` : "DS: Not found";
        }

        const statusParts = [];
        statusParts.push(`ID: ${config.id.toString()}`);
        statusParts.push(`User: ${user?.email ?? "Unknown"}`);
        statusParts.push(config.isActive ? "Active" : "Inactive");
        statusParts.push(datasourceInfo);
        if (hasHistory) {
          statusParts.push(
            `Last sync: ${mostRecentDate ? mostRecentDate.toISOString().split("T")[0] : "Unknown"}`
          );
        } else {
          statusParts.push("No history");
        }

        return {
          label: `[${config.provider}] ${statusParts.join(" | ")}`,
          value: String(config.id),
        };
      },
      { concurrency: 8 }
    );

    return new Ok({
      transcriptsConfigurationId: options,
    });
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const configurationIdStr = args.transcriptsConfigurationId[0];

    if (!configurationIdStr) {
      return new Err(new Error("No transcripts configuration selected"));
    }

    const configurationId = parseInt(configurationIdStr, 10);
    const configuration =
      await LabsTranscriptsConfigurationResource.fetchByModelId(
        configurationId
      );

    if (!configuration) {
      return new Err(
        new Error(
          `Could not find transcripts configuration with id ${configurationId}`
        )
      );
    }

    if (configuration.workspaceId !== workspace.id) {
      return new Err(
        new Error("Configuration does not belong to this workspace")
      );
    }

    // Count records before deletion
    const countBefore = await LabsTranscriptsHistoryModel.count({
      where: {
        workspaceId: workspace.id,
        configurationId: configuration.id,
      },
    });

    // Delete all history records (if any exist)
    if (countBefore > 0) {
      await LabsTranscriptsHistoryModel.destroy({
        where: {
          workspaceId: workspace.id,
          configurationId: configuration.id,
        },
      });
    }

    // Determine the correct Temporal namespace based on region
    const currentRegion = config.getCurrentRegion();
    const temporalNamespace =
      currentRegion === "europe-west1"
        ? "eu-dust-front-prod.gmnlm"
        : "dust-front-prod.gmnlm";
    const temporalLink = `https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows?query=%60WorkflowId%60+STARTS_WITH+%22labs-transcripts-retrieve-${workspace.id}-${configuration.id}%22`;

    // Stop the existing workflow if it's running (don't change isActive status)
    const stopResult = await stopRetrieveTranscriptsWorkflow(
      configuration,
      false
    );
    if (stopResult.isErr()) {
      return new Err(
        new Error(
          `Successfully deleted ${countBefore} history record(s), but failed to stop existing workflow: ${stopResult.error.message}\n\nTemporal workflow: ${temporalLink}`
        )
      );
    }

    // Start a new workflow
    const launchResult = await launchRetrieveTranscriptsWorkflow(configuration);
    if (launchResult.isErr()) {
      return new Err(
        new Error(
          `Successfully deleted ${countBefore} history record(s) and stopped workflow, but failed to restart it: ${launchResult.error.message}\n\nTemporal workflow: ${temporalLink}`
        )
      );
    }

    return new Ok({
      display: "text_content",
      value: `Successfully ${countBefore > 0 ? `deleted ${countBefore} history record(s) and ` : ""}restarted the workflow for transcripts configuration [${configuration.provider}]. The sync will now ${countBefore > 0 ? "restart from the beginning" : "start fresh"}.\n\nTemporal workflow: ${temporalLink}`,
    });
  },
});
