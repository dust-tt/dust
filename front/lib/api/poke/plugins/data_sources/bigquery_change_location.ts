import type { Dataset } from "@google-cloud/bigquery";
import { BigQuery } from "@google-cloud/bigquery";

import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger, { auditLog } from "@app/logger/logger";
import type {BigQueryCredentialsWithLocation} from "@app/types";
import {
  ConnectorsAPI,
  Err,
  normalizeError,
  OAuthAPI,
  Ok
} from "@app/types";

export const bigqueryChangeLocationPlugin = createPlugin({
  manifest: {
    id: "bigquery-change-location",
    name: "BigQuery: Change Location",
    description:
      "Change a BigQuery connector's region by creating a new credential with the selected location and updating the connector.",
    resourceTypes: ["data_sources"],
    args: {
      location: {
        type: "enum",
        async: true,
        multiple: false,
        label: "New Location",
        description:
          "Select the exact location where the datasets reside (e.g., EU, US, europe-west1).",
        values: [],
      },
      confirm: {
        type: "boolean",
        label: "Confirm",
        description:
          "Confirm you want to update the connector to the selected location.",
      },
    },
  },
  isApplicableTo: (_, dataSource) => {
    return !!dataSource && dataSource.connectorProvider === "bigquery";
  },
  populateAsyncArgs: async (auth, dataSource) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }
    if (!dataSource.connectorId) {
      return new Err(new Error("No connector on data source."));
    }

    // Fetch connector to get current credentials id
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const connectorRes = await connectorsAPI.getConnector(
      dataSource.connectorId
    );
    if (connectorRes.isErr()) {
      return new Err(
        new Error(`Failed to fetch connector: ${connectorRes.error.message}`)
      );
    }
    const connector = connectorRes.value;

    // Fetch existing credentials content
    const oAuthAPI = new OAuthAPI(config.getOAuthAPIConfig(), logger);
    const credRes = await oAuthAPI.getCredentials({
      credentialsId: connector.connectionId,
    });
    if (credRes.isErr()) {
      return new Err(
        new Error(
          `Failed to fetch current credentials: ${credRes.error.message}`
        )
      );
    }

    const content = credRes.value.credential
      .content as BigQueryCredentialsWithLocation;

    // Build a BigQuery client and collect dataset locations
    const bq = new BigQuery({
      credentials: content,
      scopes: ["https://www.googleapis.com/auth/bigquery.readonly"],
    });
    let datasets: Dataset[];
    try {
      [datasets] = await bq.getDatasets();
    } catch (e) {
      return new Err(
        new Error(`Failed to list datasets: ${normalizeError(e).message}`)
      );
    }

    const uniqueLocations = Array.from(
      new Set(
        datasets
          .map((d) => d.location?.toLowerCase())
          .filter((l): l is string => Boolean(l))
      )
    ).sort();

    return new Ok({
      location: uniqueLocations.map((loc) => ({
        label: loc,
        value: loc,
      })),
    });
  },
  execute: async (auth, dataSource, args) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }
    if (!dataSource.connectorId) {
      return new Err(new Error("No connector on data source."));
    }
    if (!args.confirm) {
      return new Err(new Error("Please confirm to proceed."));
    }
    const selected = args.location?.[0];
    if (!selected) {
      return new Err(new Error("You must select a new location."));
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const oAuthAPI = new OAuthAPI(config.getOAuthAPIConfig(), logger);

    // Fetch connector and its current credentials
    const connectorRes = await connectorsAPI.getConnector(
      dataSource.connectorId
    );
    if (connectorRes.isErr()) {
      return new Err(
        new Error(`Failed to fetch connector: ${connectorRes.error.message}`)
      );
    }
    const connector = connectorRes.value;

    const credRes = await oAuthAPI.getCredentials({
      credentialsId: connector.connectionId,
    });
    if (credRes.isErr()) {
      return new Err(
        new Error(
          `Failed to fetch current credentials: ${credRes.error.message}`
        )
      );
    }

    const content = credRes.value.credential
      .content as BigQueryCredentialsWithLocation;

    // Prepare new credentials content with updated location
    const newCredentials: BigQueryCredentialsWithLocation = {
      ...content,
      location: selected,
    };

    // Create new credentials in OAuth service
    const user = auth.getNonNullableUser();
    const workspace = auth.getNonNullableWorkspace();
    const postCredRes = await oAuthAPI.postCredentials({
      provider: "bigquery",
      credentials: newCredentials,
      userId: user.sId,
      workspaceId: workspace.sId,
    });
    if (postCredRes.isErr()) {
      return new Err(
        new Error(
          `Failed to create new credentials: ${postCredRes.error.message}`
        )
      );
    }

    const newCredentialsId = postCredRes.value.credential.credential_id;

    // Update connector to point to the new credentials
    const updateRes = await connectorsAPI.updateConnector({
      connectorId: dataSource.connectorId,
      connectionId: newCredentialsId,
    });
    if (updateRes.isErr()) {
      return new Err(
        new Error(
          `Failed to update connector with new credentials: ${updateRes.error.message}`
        )
      );
    }

    auditLog(
      {
        connectorId: dataSource.connectorId,
        previousConnectionId: connector.connectionId,
        newConnectionId: newCredentialsId,
        previousLocation: content.location,
        newLocation: selected,
        who: auth.user(),
      },
      "BigQuery connector location updated"
    );

    return new Ok({
      display: "text",
      value: `Connector ${dataSource.connectorId} updated: location ${content.location} -> ${selected}. A re-sync has been triggered.`,
    });
  },
});
