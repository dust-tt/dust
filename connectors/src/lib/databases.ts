import type { DataSourceConfig } from "@connectors/types/data_source_config";

import { withRetries } from "./dust_front_api_helpers";

const { DUST_FRONT_API } = process.env;
if (!DUST_FRONT_API) {
  throw new Error("FRONT_API not set");
}

export const createDatabase = withRetries(_createDatabase);
export const upsertTable = withRetries(_upsertTable);
export const upsertRows = withRetries(_upsertRows);

type CreateDatabaseParams = {
  dataSourceConfig: DataSourceConfig;
  databaseName: string;
};

async function _createDatabase({
  dataSourceConfig: { workspaceAPIKey, workspaceId, dataSourceName },
  databaseName,
}: CreateDatabaseParams): Promise<string> {
  const res = await fetch(
    `${DUST_FRONT_API}/api/v1/w/${workspaceId}/data_sources/${dataSourceName}/databases`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workspaceAPIKey}`,
      },
      body: JSON.stringify({ name: databaseName }),
    }
  );
  if (!res.ok) {
    throw new Error(
      `Failed to create database ${databaseName} in data source ${dataSourceName}: ${res.status} ${res.statusText}`
    );
  }
  const body = await res.json();
  return body.database_id;
}

type UpsertTableParams = {
  dataSourceConfig: DataSourceConfig;
  databaseId: string;
  name: string;
  description: string;
};

async function _upsertTable({
  dataSourceConfig: { workspaceAPIKey, workspaceId, dataSourceName },
  databaseId,
  name,
  description,
}: UpsertTableParams): Promise<string> {
  const res = await fetch(
    `${DUST_FRONT_API}/api/v1/w/${workspaceId}/data_sources/${dataSourceName}/databases/${databaseId}/tables`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workspaceAPIKey}`,
      },
      body: JSON.stringify({ name, description }),
    }
  );
  if (!res.ok) {
    throw new Error(
      `Failed to upsert table ${name} in database ${databaseId} in data source ${dataSourceName}: ${res.status} ${res.statusText}`
    );
  }
  const body = await res.json();
  return body.table_id;
}

type UpsertRowsParams = {
  dataSourceConfig: DataSourceConfig;
  databaseId: string;
  tableId: string;
  rows: {
    row_id: string;
    value: Record<string, string | number | boolean | null>;
  }[];
  truncate: boolean | undefined;
};

async function _upsertRows({
  dataSourceConfig: { workspaceAPIKey, workspaceId, dataSourceName },
  databaseId,
  tableId,
  rows,
  truncate,
}: UpsertRowsParams): Promise<void> {
  const res = await fetch(
    `${DUST_FRONT_API}/api/v1/w/${workspaceId}/data_sources/${dataSourceName}/databases/${databaseId}/tables/${tableId}/rows`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workspaceAPIKey}`,
      },
      body: JSON.stringify({ rows, truncate }),
    }
  );
  if (!res.ok) {
    throw new Error(
      `Failed to upsert rows in table ${tableId} in database ${databaseId} in data source ${dataSourceName}: ${res.status} ${res.statusText}`
    );
  }
}
