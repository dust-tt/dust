import { createPlugin } from "@app/lib/api/poke/types";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { LabsTranscriptsHistoryModel } from "@app/lib/resources/storage/models/labs_transcripts";
import { Err, Ok } from "@app/types";

export const deleteLabsTranscriptHistoriesPlugin = createPlugin({
  manifest: {
    id: "delete-labs-transcript-histories",
    name: "Transcript Full Resync",
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
    const options = await Promise.all(
      configurations.map(async (config) => {
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
        statusParts.push(`ID: ${config.sId}`);
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
          value: config.sId,
        };
      })
    );

    return new Ok({
      transcriptsConfigurationId: options,
    });
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const configurationSId = args.transcriptsConfigurationId[0];

    if (!configurationSId) {
      return new Err(new Error("No transcripts configuration selected"));
    }

    const configuration =
      await LabsTranscriptsConfigurationResource.fetchById(configurationSId);

    if (!configuration) {
      return new Err(
        new Error(
          `Could not find transcripts configuration with id ${configurationSId}`
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

    if (countBefore === 0) {
      return new Ok({
        display: "text",
        value: `No history records found for this transcripts configuration.`,
      });
    }

    // Delete all history records
    await LabsTranscriptsHistoryModel.destroy({
      where: {
        workspaceId: workspace.id,
        configurationId: configuration.id,
      },
    });

    return new Ok({
      display: "text",
      value: `Successfully deleted ${countBefore} history record(s) for transcripts configuration [${configuration.provider}]. The sync can now restart from the beginning.`,
    });
  },
});
