import { Connector } from "@connectors/lib/models";
import { Err, Ok, Result } from "@connectors/lib/result";
import { DataSourceConfig } from "@connectors/types/data_source_config";

import { ConnectorCreatorParams } from "..";
import { validateInstallationId } from "./lib/github_api";

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

  const connector = await Connector.create({
    type: "github",
    githubInstallationId,
    workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
    workspaceId: dataSourceConfig.workspaceId,
    dataSourceName: dataSourceConfig.dataSourceName,
  });

  return new Ok(connector.id.toString());
}
