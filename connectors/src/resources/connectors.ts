import { eq, or } from "drizzle-orm";

import { getDbConnection } from "@connectors/resources/db";
import type { NewConnector } from "@connectors/resources/db/schema";
import { connectors } from "@connectors/resources/db/schema";

// TODO:
type Workspace = any;

const db = getDbConnection();

export async function fetchConnector(connectorId: number) {
  return db.select().from(connectors).where(eq(connectors.id, connectorId));
}

export async function listAllConnectorsForWorkspace(workspace: Workspace) {
  return db
    .select()
    .from(connectors)
    .where(eq(connectors.workspaceId, workspace.sId));
}

export async function createConnector(blob: NewConnector) {
  return db.insert(connectors).values(blob).returning(); // Returns all columns of the newly inserted row
}

const connector = await fetchConnector(1);

const connectorsForWorkspace = await listAllConnectorsForWorkspace({
  sId: "123abc",
});

const newConnector = await createConnector({
  type: "confluence",
  connectionId: "connectionId",
  workspaceAPIKey: "workspaceAPIKey",
  workspaceId: "workspaceId",
  dataSourceName: "dataSourceName",
});
