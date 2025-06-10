import {
  runSOQL,
  testSalesforceConnection,
} from "@connectors/connectors/salesforce/lib/salesforce_api";
import {
  getConnectorAndCredentials,
  syncQueryTemplateInterpolate,
} from "@connectors/connectors/salesforce/lib/utils";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SalesforceSyncedQueryResource } from "@connectors/resources/salesforce_resources";
import type {
  SalesforceCheckConnectionResponseType,
  SalesforceCommandType,
  SalesforceRunSoqlResponseType,
  SalesforceSetupSyncedQueryResponseType,
  SalesforceSyncQueryResponseType,
} from "@connectors/types";

import { launchSalesforceSyncQueryWorkflow } from "../temporal/client";

export const salesforce = async ({
  command,
  args,
}: SalesforceCommandType): Promise<
  | SalesforceCheckConnectionResponseType
  | SalesforceRunSoqlResponseType
  | SalesforceSetupSyncedQueryResponseType
  | SalesforceSyncQueryResponseType
> => {
  const logger = topLogger.child({ majorCommand: "salesforce", command, args });

  if (!args.wId) {
    throw new Error("Missing --wId argument");
  }
  if (!args.dsId) {
    throw new Error("Missing --dsId argument");
  }

  const connector = await ConnectorResource.findByDataSource({
    workspaceId: args.wId,
    dataSourceId: args.dsId,
  });
  if (!connector) {
    throw new Error(
      `Connector not found for workspace ${args.wId} and data source ${args.dsId}.`
    );
  }

  if (connector.type !== "salesforce") {
    throw new Error(`Connector is not of type salesforce`);
  }

  const connCredRes = await getConnectorAndCredentials(connector.id);
  if (connCredRes.isErr()) {
    throw connCredRes.error;
  }

  switch (command) {
    case "check-connection": {
      const testRes = await testSalesforceConnection(
        connCredRes.value.credentials
      );
      if (testRes.isErr()) {
        throw testRes.error;
      }

      logger.info("Salesforce connection test successful");
      return { ok: true };
    }
    case "run-soql": {
      if (!args.soql) {
        throw new Error("Missing --soql argument");
      }

      const res = await runSOQL({
        soql: args.soql,
        credentials: connCredRes.value.credentials,
        limit: args.limit,
        offset: args.offset,
        lastModifiedDateOrder: "DESC",
      });
      if (res.isErr()) {
        throw res.error;
      }

      return {
        records: res.value.records,
        totalSize: res.value.totalSize,
        done: res.value.done,
      };
    }
    case "setup-synced-query": {
      if (!args.soql) {
        throw new Error("Missing --soql argument");
      }
      if (!args.titleTemplate) {
        throw new Error("Missing --titleTemplate argument");
      }
      if (!args.contentTemplate) {
        throw new Error("Missing --contentTemplate argument");
      }
      if (!args.rootNodeName) {
        throw new Error("Missing --rootNodeName argument");
      }

      const contentTemplate = args.contentTemplate;
      const titleTemplate = args.titleTemplate;
      const tagsTemplate = args.tagsTemplate ?? null;

      if (
        args.soql.toLowerCase().includes("limit") ||
        args.soql.toLowerCase().includes("offset")
      ) {
        throw new Error(
          "The SOQL query should not contain LIMIT or OFFSET clauses (automatically added)"
        );
      }

      const res = await runSOQL({
        soql: args.soql,
        credentials: connCredRes.value.credentials,
        limit: 8,
        offset: 0,
        lastModifiedDateOrder: "DESC",
      });
      if (res.isErr()) {
        throw res.error;
      }

      const documents = res.value.records.map((record) => {
        if (!record.Id || !record.LastModifiedDate) {
          throw new Error(
            "Record is missing required fields: Id or LastModifiedDate"
          );
        }
        let tags: string[] = [];
        if (tagsTemplate) {
          const raw = syncQueryTemplateInterpolate(tagsTemplate, record, true);
          tags = raw
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag);
        }

        return {
          id: record.Id,
          lastModifiedDate: new Date(record.LastModifiedDate).toISOString(),
          title: syncQueryTemplateInterpolate(titleTemplate, record, true),
          content: syncQueryTemplateInterpolate(contentTemplate, record, true),
          tags,
        };
      });

      if (args.execute) {
        const query = await SalesforceSyncedQueryResource.makeNew({
          blob: {
            connectorId: connCredRes.value.connector.id,
            rootNodeName: args.rootNodeName,
            soql: args.soql,
            titleTemplate,
            contentTemplate,
            tagsTemplate,
            lastSeenModifiedDate: null,
          },
        });
        return { documents, created: true, queryId: query.id };
      }
      return { documents, created: args.execute ?? false, queryId: null };
    }

    case "sync-query": {
      if (!args.queryId) {
        throw new Error("Missing --queryId argument");
      }

      const query = await SalesforceSyncedQueryResource.fetchById(args.queryId);
      if (!query) {
        throw new Error(`Query with ID ${args.queryId} not found.`);
      }

      const { connector } = connCredRes.value;

      if (query.connectorId !== connector.id) {
        throw new Error(
          `Query with ID ${args.queryId} does not belong to connector ${connector.id}.`
        );
      }

      const workflowRes = await launchSalesforceSyncQueryWorkflow(
        connector.id,
        query.id,
        args.full ? null : query.lastSeenModifiedDate
      );

      if (workflowRes.isErr()) {
        throw workflowRes.error;
      }

      return {
        workflowId: workflowRes.value,
      };
    }
  }
};
