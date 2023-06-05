import { ConnectorCreatorParams } from "@connectors/connectors";
import { validateInstallationId } from "@connectors/connectors/github/lib/github_api";
import { launchGithubFullSyncWorkflow } from "@connectors/connectors/github/temporal/client";
import { Connector, sequelize_conn } from "@connectors/lib/models";
import { Err, Ok, Result } from "@connectors/lib/result";
import mainLogger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";

const logger = mainLogger.child({ provider: "github" });

export async function createGithubConnector(
  dataSourceConfig: DataSourceConfig,
  params: ConnectorCreatorParams
): Promise<Result<string, Error>> {
  if (!("githubInstallationId" in params)) {
    return new Err(new Error("githubInstallationId is not defined"));
  }

  const githubInstallationId = params.githubInstallationId;
  if (!(await validateInstallationId(githubInstallationId))) {
    return new Err(new Error("Github installation id is invalid"));
  }

  const transaction = await sequelize_conn.transaction();

  try {
    const connector = await Connector.create(
      {
        type: "github",
        githubInstallationId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceName: dataSourceConfig.dataSourceName,
      },
      { transaction }
    );
    await launchGithubFullSyncWorkflow(connector.id.toString());
    await transaction.commit();
    return new Ok(connector.id.toString());
  } catch (err) {
    logger.error({ error: err }, "Error creating github connector");
    await transaction.rollback();
    return new Err(err as Error);
  }
}
