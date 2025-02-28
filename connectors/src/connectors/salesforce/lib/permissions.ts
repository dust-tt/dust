import type { ContentNode, ModelId, Result } from "@dust-tt/types";
import { Err, MIME_TYPES, Ok } from "@dust-tt/types";

import type { SalesforceAPICredentials } from "@connectors/connectors/salesforce/lib/oauth";
import {
  fetchDatabases,
  fetchSchemas,
  fetchTables,
} from "@connectors/connectors/salesforce/lib/salesforce_api";
import {
  RemoteDatabaseModel,
  RemoteSchemaModel,
  RemoteTableModel,
} from "@connectors/lib/models/remote_databases";
import {
  getContentNodeFromInternalId,
  getContentNodeTypeFromInternalId,
} from "@connectors/lib/remote_databases/content_nodes";

/**
 * Retrieves the existing content nodes for a parent in the Salesforce account.
 * If parentInternalId is null, we are at the root level and we fetch databases.
 * If parentInternalId is a database, we fetch schemas.
 * If parentInternalId is a schema, we fetch tables.
 */
export const fetchAvailableChildrenInSalesforce = async ({
  connectorId,
  credentials,
  parentInternalId,
}: {
  connectorId: ModelId;
  credentials: SalesforceAPICredentials;
  parentInternalId: string | null;
}): Promise<Result<ContentNode[], Error>> => {
  if (parentInternalId === null) {
    const syncedDatabases = await RemoteDatabaseModel.findAll({
      where: { connectorId, permission: "selected" },
    });
    const syncedDatabasesInternalIds = syncedDatabases.map(
      (db) => db.internalId
    );

    const allDatabases = fetchDatabases();

    return new Ok(
      allDatabases.map((row) => {
        const internalId = `${row.name}`;
        const permission = syncedDatabasesInternalIds.includes(internalId)
          ? "read"
          : "none";
        return getContentNodeFromInternalId(
          internalId,
          permission,
          MIME_TYPES.SALESFORCE
        );
      })
    );
  }

  const parentType = getContentNodeTypeFromInternalId(parentInternalId);

  if (parentType === "database") {
    const syncedSchemas = await RemoteSchemaModel.findAll({
      where: { connectorId, permission: "selected" },
    });
    const syncedSchemasInternalIds = syncedSchemas.map((db) => db.internalId);

    const allSchemas = fetchSchemas();

    return new Ok(
      allSchemas.map((row) => {
        const internalId = `${parentInternalId}.${row.name}`;
        const permission = syncedSchemasInternalIds.includes(internalId)
          ? "read"
          : "none";
        return getContentNodeFromInternalId(
          internalId,
          permission,
          MIME_TYPES.SALESFORCE
        );
      })
    );
  }

  if (parentType === "schema") {
    const syncedTables = await RemoteTableModel.findAll({
      where: { connectorId },
    });
    const syncedTablesInternalIds = syncedTables.map((db) => db.internalId);

    const allTablesRes = await fetchTables({
      credentials,
      parentInternalId,
    });
    if (allTablesRes.isErr()) {
      return new Err(allTablesRes.error);
    }
    return new Ok(
      allTablesRes.value.map((row) => {
        const internalId = `${parentInternalId}.${row.name}`;
        const permission = syncedTablesInternalIds.includes(internalId)
          ? "read"
          : "none";
        return getContentNodeFromInternalId(
          internalId,
          permission,
          MIME_TYPES.SALESFORCE
        );
      })
    );
  }

  return new Err(new Error(`Invalid parentInternalId: ${parentInternalId}`));
};

/**
 * Retrieves the selected content nodes for a parent in our database.
 * They are the content nodes that we were given access to by the admin.
 */
export const fetchReadNodes = async ({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<Result<ContentNode[], Error>> => {
  const [availableDatabases, availableSchemas, availableTables] =
    await Promise.all([
      RemoteDatabaseModel.findAll({
        where: { connectorId, permission: "selected" },
      }),
      RemoteSchemaModel.findAll({
        where: { connectorId, permission: "selected" },
      }),
      RemoteTableModel.findAll({
        where: { connectorId, permission: "selected" },
      }),
    ]);

  return new Ok([
    ...availableDatabases.map((db) =>
      getContentNodeFromInternalId(db.internalId, "read", MIME_TYPES.SALESFORCE)
    ),
    ...availableSchemas.map((schema) =>
      getContentNodeFromInternalId(
        schema.internalId,
        "read",
        MIME_TYPES.SALESFORCE
      )
    ),
    ...availableTables.map((table) =>
      getContentNodeFromInternalId(
        table.internalId,
        "read",
        MIME_TYPES.SALESFORCE
      )
    ),
  ]);
};

export const fetchSyncedChildren = async ({
  connectorId,
  parentInternalId,
}: {
  connectorId: ModelId;
  parentInternalId: string | null;
}): Promise<Result<ContentNode[], Error>> => {
  if (parentInternalId === null) {
    throw new Error("Should not be called with parentInternalId null.");
  }

  const parentType = getContentNodeTypeFromInternalId(parentInternalId);

  // We want to fetch all the schemas for which we have access to at least one table.
  if (parentType === "database") {
    // If the database is in db with permission: "selected" we have full access to it (it means the user selected this node).
    // That means we have access to all schemas and tables.
    // In that case we loop on all schemas.
    const availableDatabase = await RemoteDatabaseModel.findOne({
      where: {
        connectorId,
        internalId: parentInternalId,
        permission: "selected",
      },
    });
    if (availableDatabase) {
      const schemas = await RemoteSchemaModel.findAll({
        where: {
          connectorId,
          databaseName: parentInternalId,
          permission: ["selected", "inherited"],
        },
      });
      const schemaContentNodes = schemas.map((schema) =>
        getContentNodeFromInternalId(
          schema.internalId,
          "read",
          MIME_TYPES.SALESFORCE
        )
      );
      return new Ok(schemaContentNodes);
    }

    // Otherwise, we will fetch all the schemas we have full access to,
    // which are the ones in db with permission: "selected" (the ones with "inherited" are absorbed in the case above).
    // + the schemas for the tables that were explicitly selected.
    const [availableSchemas, availableTables] = await Promise.all([
      RemoteSchemaModel.findAll({
        where: {
          connectorId,
          databaseName: parentInternalId,
          permission: "selected",
        },
      }),
      RemoteTableModel.findAll({
        where: {
          connectorId,
          databaseName: parentInternalId,
          permission: "selected",
        },
      }),
    ]);
    const schemas = availableSchemas.map((schema) =>
      getContentNodeFromInternalId(
        schema.internalId,
        "read",
        MIME_TYPES.SALESFORCE
      )
    );
    availableTables.forEach((table) => {
      const schemaToAdd = `${table.databaseName}.${table.schemaName}`;
      if (!schemas.find((s) => s.internalId === schemaToAdd)) {
        schemas.push(
          getContentNodeFromInternalId(
            schemaToAdd,
            "none",
            MIME_TYPES.SALESFORCE
          )
        );
      }
    });
    return new Ok(schemas);
  }

  // Since we have all tables in the database, we can just return all the tables we have for this schema.
  if (parentType === "schema") {
    const [databaseName, schemaName] = parentInternalId.split(".");
    const availableTables = await RemoteTableModel.findAll({
      where: {
        connectorId,
        databaseName,
        schemaName,
      },
    });
    const tables = availableTables.map((table) =>
      getContentNodeFromInternalId(
        table.internalId,
        "read",
        MIME_TYPES.SALESFORCE
      )
    );
    return new Ok(tables);
  }

  return new Ok([]);
};

export const isStandardObjectWhitelisted = (objectName: string) => {
  const whitelist = [
    // From https://architect.salesforce.com/diagrams/data-models/sales-cloud/sales-cloud-overview
    "Account",
    "AccountContactRelation",
    "AccountTeamMember",
    "Asset",
    "Case",
    "Campaign",
    "CampaignMember",
    "Contact",
    "Contract",
    "ContractContactRole",
    "ForecastItem",
    "Lead",
    "Opportunity",
    "OpportunityHistory",
    "OpportunityContactRole",
    "OpportunityForecast",
    "OpportunityLineItem",
    "OpportunityTeamMember",
    "Order",
    "Partner",
    "PartnerRole",
    "PricebookEntry",
    "Product2",
    "Quote",
    "User",
    "Territory",
    "AccountTerritory",
    // https://architect.salesforce.com/diagrams/data-models/service-cloud/service-cloud-overview
    "Account",
    "AccountContactRelation",
    "Case",
    "CaseArticle",
    "CaseComment",
    "CaseHistory",
    "CaseMilestone",
    "CaseRelatedIssue",
    "CaseSolution",
    "CaseTeamMember",
    "CaseTeamRole",
    "CategoryData",
    "CategoryNode",
    "Contact",
    "ContactRequest",
    "ContractLineItem",
    "EmailMessage",
    "Entitlement",
    "EntitlementContact",
    "Incident",
    "KnowledgeArticle",
    "KnowledgeArticleVersion",
    "Milestone",
    "Problem",
    "ServiceContract",
    "Solution",
    "Swarm",
    "SwarmMember",
  ];
  return whitelist.includes(objectName);
};
