import { ConnectorCreatorParams } from "@connectors/connectors";
import { validateInstallationId } from "@connectors/connectors/github/lib/github_api";
import { launchGithubFullSyncWorkflow } from "@connectors/connectors/github/temporal/client";
import { Connector } from "@connectors/lib/models";
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

  try {
    const connector = await Connector.create({
      type: "github",
      githubInstallationId,
      workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
    });
    await launchGithubFullSyncWorkflow(connector.id.toString());
    return new Ok(connector.id.toString());
  } catch (err) {
    logger.error({ error: err }, "Error creating github connector");
    return new Err(err as Error);
  }
}
