import { Op } from "sequelize";

import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { LabsTranscriptsConfigurationModel } from "@app/lib/resources/storage/models/labs_transcripts";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import {
  launchRetrieveTranscriptsWorkflow,
  stopRetrieveTranscriptsWorkflow,
} from "@app/temporal/labs/transcripts/client";

async function disableTranscriptsOnConnectedDataSources({
  execute,
  logger,
}: {
  execute: boolean;
  logger: Logger;
}) {
  // Find all transcript configurations pointing to a connected data source
  // (i.e., data_sources where connectorId is not null).
  const configurations = await LabsTranscriptsConfigurationModel.findAll({
    where: {
      dataSourceViewId: { [Op.ne]: null },
    },
    include: [
      {
        model: DataSourceViewModel,
        as: "dataSourceView",
        required: true,
        include: [
          {
            model: DataSourceModel,
            as: "dataSourceForView",
            required: true,
            where: {
              connectorId: { [Op.ne]: null },
            },
          },
        ],
      },
    ],
  });

  logger.info(
    { count: configurations.length },
    "Found transcript configurations pointing to connected data sources"
  );

  for (const config of configurations) {
    const resource = new LabsTranscriptsConfigurationResource(
      LabsTranscriptsConfigurationModel,
      config.get()
    );

    logger.info(
      {
        configId: config.id,
        workspaceId: config.workspaceId,
        provider: config.provider,
        status: config.status,
        dataSourceViewId: config.dataSourceViewId,
      },
      "Disabling transcript configuration on connected data source"
    );

    if (!execute) {
      continue;
    }

    // Mirror the PATCH endpoint behavior: stop workflow, clear dataSourceViewId,
    // then restart if the config is still active.
    await stopRetrieveTranscriptsWorkflow(resource, false);
    await resource.setDataSourceView(null);

    if (resource.isActive()) {
      await launchRetrieveTranscriptsWorkflow(resource);
    }

    logger.info(
      { configId: config.id, workspaceId: config.workspaceId },
      "Cleared dataSourceViewId for transcript configuration"
    );
  }
}

makeScript({}, async ({ execute }, logger) => {
  await disableTranscriptsOnConnectedDataSources({ execute, logger });
});
