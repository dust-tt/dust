import { Transaction } from "sequelize";

import {
  getReposPage,
  validateInstallationId,
} from "@connectors/connectors/github/lib/github_api";
import { launchGithubFullSyncWorkflow } from "@connectors/connectors/github/temporal/client";
import {
  Connector,
  GithubConnectorState,
  GithubIssue,
  ModelId,
  sequelize_conn,
} from "@connectors/lib/models";
import { Err, Ok, Result } from "@connectors/lib/result";
import mainLogger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";
import { ConnectorResource } from "@connectors/types/resources";

type GithubInstallationId = string;

const logger = mainLogger.child({ provider: "github" });

export async function createGithubConnector(
  dataSourceConfig: DataSourceConfig,
  connectionId: GithubInstallationId
): Promise<Result<string, Error>> {
  const githubInstallationId = connectionId;

  if (!(await validateInstallationId(githubInstallationId))) {
    return new Err(new Error("Github installation id is invalid"));
  }

  const transaction = await sequelize_conn.transaction();
  try {
    const connector = await Connector.create(
      {
        type: "github",
        connectionId: githubInstallationId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceName: dataSourceConfig.dataSourceName,
      },
      { transaction }
    );
    await GithubConnectorState.create(
      {
        connectorId: connector.id,
        webhooksEnabledAt: new Date(),
      },
      { transaction }
    );
    await transaction.commit();
    await launchGithubFullSyncWorkflow(connector.id.toString());
    return new Ok(connector.id.toString());
  } catch (err) {
    logger.error({ error: err }, "Error creating github connector");
    await transaction.rollback();
    return new Err(err as Error);
  }
}

export async function stopGithubConnector(
  connectorId: string
): Promise<Result<string, Error>> {
  try {
    const connector = await Connector.findOne({
      where: {
        id: connectorId,
      },
    });

    if (!connector) {
      return new Err(new Error("Connector not found"));
    }

    const connectorState = await GithubConnectorState.findOne({
      where: {
        connectorId: connector.id,
      },
    });

    if (!connectorState) {
      return new Err(new Error("Connector state not found"));
    }

    if (!connectorState.webhooksEnabledAt) {
      return new Err(new Error("Connector is already stopped"));
    }

    await connectorState.update({
      webhooksEnabledAt: null,
    });

    return new Ok(connector.id.toString());
  } catch (err) {
    return new Err(err as Error);
  }
}

export async function resumeGithubConnector(
  connectorId: string
): Promise<Result<string, Error>> {
  try {
    const connector = await Connector.findOne({
      where: {
        id: connectorId,
      },
    });

    if (!connector) {
      return new Err(new Error("Connector not found"));
    }

    const connectorState = await GithubConnectorState.findOne({
      where: {
        connectorId: connector.id,
      },
    });

    if (!connectorState) {
      return new Err(new Error("Connector state not found"));
    }

    if (connectorState.webhooksEnabledAt) {
      return new Err(new Error("Connector is not stopped"));
    }

    await connectorState.update({
      webhooksEnabledAt: new Date(),
    });

    await launchGithubFullSyncWorkflow(connector.id.toString());

    return new Ok(connector.id.toString());
  } catch (err) {
    return new Err(err as Error);
  }
}

export async function fullResyncGithubConnector(
  connectorId: string,
  fromTs: number | null
): Promise<Result<string, Error>> {
  if (fromTs) {
    return new Err(
      new Error("Github connector does not support partial resync")
    );
  }

  try {
    await launchGithubFullSyncWorkflow(connectorId);
    return new Ok(connectorId);
  } catch (err) {
    return new Err(err as Error);
  }
}

export async function cleanupGithubConnector(
  connectorId: string,
  transaction: Transaction
): Promise<Result<void, Error>> {
  try {
    const connector = await Connector.findOne({
      where: {
        id: connectorId,
      },
      transaction,
    });

    if (!connector) {
      logger.error({ connectorId }, "Connector not found");
      return new Err(new Error("Connector not found"));
    }

    await GithubIssue.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await GithubConnectorState.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    return new Ok(undefined);
  } catch (err) {
    logger.error(
      { connectorId, error: err },
      "Error cleaning up github connector"
    );
    return new Err(err as Error);
  }
}

export async function retrieveGithubConnectorPermissions(
  connectorId: ModelId,
  parentInternalId: string | null
): Promise<Result<ConnectorResource[], Error>> {
  if (parentInternalId) {
    return new Err(
      new Error(
        "Github connector does not support permission retrieval with `parentInternalId`"
      )
    );
  }

  const c = await Connector.findOne({
    where: {
      id: connectorId,
    },
  });
  if (!c) {
    logger.error({ connectorId }, "Connector not found");
    return new Err(new Error("Connector not found"));
  }

  const githubInstallationId = c.connectionId;

  let resources: ConnectorResource[] = [];
  let pageNumber = 1; // 1-indexed
  for (;;) {
    const page = await getReposPage(githubInstallationId, pageNumber);
    pageNumber += 1;
    if (page.length === 0) {
      break;
    }

    resources = resources.concat(
      page.map((repo) => ({
        provider: c.type,
        internalId: repo.id.toString(),
        parentInternalId: null,
        type: "folder",
        title: repo.name,
        sourceUrl: repo.url,
        expandable: false,
        permission: "read",
      }))
    );
  }

  return new Ok(resources);
}
