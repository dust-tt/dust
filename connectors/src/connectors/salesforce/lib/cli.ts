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
import type {
  SalesforceCheckConnectionResponseType,
  SalesforceCommandType,
  SalesforceRunSoqlResponseType,
  SalesforceSetupSyncedQueryResponseType,
} from "@connectors/types";

export const salesforce = async ({
  command,
  args,
}: SalesforceCommandType): Promise<
  | SalesforceCheckConnectionResponseType
  | SalesforceRunSoqlResponseType
  | SalesforceSetupSyncedQueryResponseType
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
      });
      if (res.isErr()) {
        throw res.error;
      }

      return { records: res.value.records };
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

      const res = await runSOQL({
        soql: args.soql,
        credentials: connCredRes.value.credentials,
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
          const raw = syncQueryTemplateInterpolate(tagsTemplate, record);
          tags = raw
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag);
        }

        return {
          id: record.Id,
          lastModifiedDate: new Date(record.LastModifiedDate).toISOString(),
          title: syncQueryTemplateInterpolate(titleTemplate, record),
          content: syncQueryTemplateInterpolate(contentTemplate, record),
          tags,
        };
      });

      // TODO(spolu): --execute: true

      return { documents, created: false };
    }
  }
};
