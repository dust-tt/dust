import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { getTemporalClientForConnectorsNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { InternalConnectorType } from "@app/types/connectors/connectors_api";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { SlackAutoReadPattern } from "@app/types/connectors/slack";
import { isSlackAutoReadPatterns } from "@app/types/connectors/slack";
import { CoreAPI } from "@app/types/core/core_api";
import type { CoreAPIDataSource } from "@app/types/core/data_source";
import type { DataSourceType } from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type FeaturesType = {
  slackBotEnabled: boolean;
  googleDrivePdfEnabled: boolean;
  googleDriveLargeFilesEnabled: boolean;
  microsoftPdfEnabled: boolean;
  microsoftLargeFilesEnabled: boolean;
  googleDriveCsvEnabled: boolean;
  microsoftCsvEnabled: boolean;
  githubCodeSyncEnabled: boolean;
  githubUseProxyEnabled: boolean;
  autoReadChannelPatterns: SlackAutoReadPattern[];
};

export type PokeGetDataSourceDetails = {
  dataSource: DataSourceType;
  dataSourceViews: DataSourceViewType[];
  coreDataSource: CoreAPIDataSource;
  connector: InternalConnectorType | null;
  features: FeaturesType;
  temporalWorkspace: string;
  temporalRunningWorkflows: {
    workflowId: string;
    runId: string;
    status: string;
  }[];
};

// Mounted at /api/poke/workspaces/:wId/data_sources/:dsId/details.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<PokeGetDataSourceDetails> => {
  const auth = ctx.get("auth");
  const dsId = ctx.req.param("dsId") ?? "";

  const dataSource = await DataSourceResource.fetchById(auth, dsId, {
    includeEditedBy: true,
  });
  if (!dataSource) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "Data source not found.",
      },
    });
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const coreDataSourceRes = await coreAPI.getDataSource({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
  });

  if (coreDataSourceRes.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "Core data source not found.",
      },
    });
  }

  const dataSourceViews = await DataSourceViewResource.listForDataSources(
    auth,
    [dataSource]
  );

  let connector: InternalConnectorType | null = null;
  const workflowInfos: {
    workflowId: string;
    runId: string;
    status: string;
  }[] = [];

  if (dataSource.connectorId) {
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const connectorRes = await connectorsAPI.getConnector(
      dataSource.connectorId
    );
    if (connectorRes.isOk()) {
      connector = connectorRes.value;
      const temporalClient = await getTemporalClientForConnectorsNamespace();

      const workflowsIter = temporalClient.workflow.list({
        query: `ExecutionStatus = 'Running' AND connectorId = ${connector.id}`,
      });

      for await (const infos of workflowsIter) {
        workflowInfos.push({
          workflowId: infos.workflowId,
          runId: infos.runId,
          status: infos.status.name,
        });
      }
    } else {
      logger.error(
        { connectorId: dataSource.connectorId },
        "Failed to get connector"
      );
    }
  }

  const features: FeaturesType = {
    slackBotEnabled: false,
    googleDrivePdfEnabled: false,
    googleDriveLargeFilesEnabled: false,
    microsoftPdfEnabled: false,
    microsoftLargeFilesEnabled: false,
    googleDriveCsvEnabled: false,
    microsoftCsvEnabled: false,
    githubCodeSyncEnabled: false,
    githubUseProxyEnabled: false,
    autoReadChannelPatterns: [],
  };

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  if (dataSource.connectorId) {
    switch (dataSource.connectorProvider) {
      case "slack_bot":
      case "slack": {
        const botEnabledRes = await connectorsAPI.getConnectorConfig(
          dataSource.connectorId,
          "botEnabled"
        );
        if (botEnabledRes.isErr()) {
          throw botEnabledRes.error;
        }
        features.slackBotEnabled = botEnabledRes.value.configValue === "true";

        const autoReadChannelPatternsRes =
          await connectorsAPI.getConnectorConfig(
            dataSource.connectorId,
            "autoReadChannelPatterns"
          );
        if (autoReadChannelPatternsRes.isErr()) {
          throw autoReadChannelPatternsRes.error;
        }

        const parsedAutoReadChannelPatternsRes = safeParseJSON(
          autoReadChannelPatternsRes.value.configValue
        );
        if (parsedAutoReadChannelPatternsRes.isErr()) {
          throw parsedAutoReadChannelPatternsRes.error;
        }

        if (
          !parsedAutoReadChannelPatternsRes.value ||
          !Array.isArray(parsedAutoReadChannelPatternsRes.value) ||
          !isSlackAutoReadPatterns(parsedAutoReadChannelPatternsRes.value)
        ) {
          throw new Error("Invalid auto read channel patterns");
        }

        features.autoReadChannelPatterns =
          parsedAutoReadChannelPatternsRes.value;
        break;
      }

      case "google_drive": {
        const gdrivePdfEnabledRes = await connectorsAPI.getConnectorConfig(
          dataSource.connectorId,
          "pdfEnabled"
        );
        if (gdrivePdfEnabledRes.isErr()) {
          throw gdrivePdfEnabledRes.error;
        }
        features.googleDrivePdfEnabled =
          gdrivePdfEnabledRes.value.configValue === "true";

        const gdriveCsvEnabledRes = await connectorsAPI.getConnectorConfig(
          dataSource.connectorId,
          "csvEnabled"
        );
        if (gdriveCsvEnabledRes.isErr()) {
          throw gdriveCsvEnabledRes.error;
        }
        features.googleDriveCsvEnabled =
          gdriveCsvEnabledRes.value.configValue === "true";

        const gdriveLargeFilesEnabledRes =
          await connectorsAPI.getConnectorConfig(
            dataSource.connectorId,
            "largeFilesEnabled"
          );
        if (gdriveLargeFilesEnabledRes.isErr()) {
          throw gdriveLargeFilesEnabledRes.error;
        }
        features.googleDriveLargeFilesEnabled =
          gdriveLargeFilesEnabledRes.value.configValue === "true";
        break;
      }

      case "microsoft": {
        const microsoftPdfEnabledRes = await connectorsAPI.getConnectorConfig(
          dataSource.connectorId,
          "pdfEnabled"
        );
        if (microsoftPdfEnabledRes.isErr()) {
          throw microsoftPdfEnabledRes.error;
        }
        features.microsoftPdfEnabled =
          microsoftPdfEnabledRes.value.configValue === "true";

        const microsoftCsvEnabledRes = await connectorsAPI.getConnectorConfig(
          dataSource.connectorId,
          "csvEnabled"
        );
        if (microsoftCsvEnabledRes.isErr()) {
          throw microsoftCsvEnabledRes.error;
        }
        features.microsoftCsvEnabled =
          microsoftCsvEnabledRes.value.configValue === "true";

        const microsoftLargeFilesEnabledRes =
          await connectorsAPI.getConnectorConfig(
            dataSource.connectorId,
            "largeFilesEnabled"
          );
        if (microsoftLargeFilesEnabledRes.isErr()) {
          throw microsoftLargeFilesEnabledRes.error;
        }
        features.microsoftLargeFilesEnabled =
          microsoftLargeFilesEnabledRes.value.configValue === "true";
        break;
      }

      case "github": {
        const githubConnectorEnabledRes =
          await connectorsAPI.getConnectorConfig(
            dataSource.connectorId,
            "codeSyncEnabled"
          );
        if (githubConnectorEnabledRes.isErr()) {
          throw githubConnectorEnabledRes.error;
        }
        features.githubCodeSyncEnabled =
          githubConnectorEnabledRes.value.configValue === "true";

        const githubUseProxyRes = await connectorsAPI.getConnectorConfig(
          dataSource.connectorId,
          "useProxy"
        );
        if (githubUseProxyRes.isErr()) {
          throw githubUseProxyRes.error;
        }
        features.githubUseProxyEnabled =
          githubUseProxyRes.value.configValue === "true";
        break;
      }
    }
  }

  return ctx.json({
    dataSource: dataSource.toJSON(),
    dataSourceViews: dataSourceViews.map((view) => view.toJSON()),
    coreDataSource: coreDataSourceRes.value.data_source,
    connector,
    features,
    temporalWorkspace: config.getTemporalConnectorsNamespace() ?? "",
    temporalRunningWorkflows: workflowInfos,
  });
});

export default app;
