import assert from "assert";
import fs from "fs/promises";

import { listConfluenceSpaces } from "@connectors/connectors/confluence/lib/confluence_api";
import {
  confluenceUpdatePagesParentIdsActivity,
  fetchConfluenceConfigurationActivity,
  getConfluenceClient,
} from "@connectors/connectors/confluence/temporal/activities";
import { QUEUE_NAME } from "@connectors/connectors/confluence/temporal/config";
import {
  confluenceSpaceSyncWorkflow,
  confluenceUpsertPagesWithFullParentsWorkflow,
  confluenceUpsertPageWithFullParentsWorkflow,
} from "@connectors/connectors/confluence/temporal/workflows";
import {
  ConfluenceConfiguration,
  ConfluencePage,
  ConfluenceSpace,
} from "@connectors/lib/models/confluence";
import { getTemporalClient } from "@connectors/lib/temporal";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type {
  AdminSuccessResponseType,
  ConfluenceCheckSpaceAccessResponseType,
  ConfluenceCommandType,
  ConfluenceMeResponseType,
  ConfluenceResolveSpaceFromUrlResponseType,
  ConfluenceUpsertPageResponseType,
} from "@connectors/types";

export const confluence = async ({
  command,
  args,
}: ConfluenceCommandType): Promise<
  | AdminSuccessResponseType
  | ConfluenceUpsertPageResponseType
  | ConfluenceMeResponseType
  | ConfluenceCheckSpaceAccessResponseType
  | ConfluenceResolveSpaceFromUrlResponseType
> => {
  const logger = topLogger.child({ majorCommand: "confluence", command, args });

  switch (command) {
    case "me": {
      if (!args.connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      const { connectorId } = args;
      const connector = await ConnectorResource.fetchById(connectorId);
      if (!connector) {
        throw new Error("Connector not found.");
      }
      if (connector.type !== "confluence") {
        throw new Error("Connector is not a Confluence connector.");
      }
      const confluenceConfig =
        await fetchConfluenceConfigurationActivity(connectorId);
      const client = await getConfluenceClient(
        { cloudId: confluenceConfig?.cloudId },
        connector
      );
      return { me: await client.getUserAccount() };
    }
    case "upsert-page": {
      if (!args.connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      if (!args.pageId) {
        throw new Error("Missing --pageId argument");
      }
      const { connectorId } = args;
      const pageId = args.pageId.toString();

      const client = await getTemporalClient();
      const workflow = await client.workflow.start(
        confluenceUpsertPageWithFullParentsWorkflow,
        {
          args: [{ connectorId, pageId }],
          taskQueue: QUEUE_NAME,
          workflowId: `confluence-upsert-page-${connectorId}-${pageId}`,
          searchAttributes: { connectorId: [connectorId] },
          memo: { connectorId },
        }
      );

      const { workflowId } = workflow;
      const temporalNamespace = process.env.TEMPORAL_NAMESPACE;
      if (!temporalNamespace) {
        logger.info(`[Admin] Started temporal workflow with id: ${workflowId}`);
      } else {
        logger.info(
          `[Admin] Started temporal workflow with id: ${workflowId} - https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${workflowId}`
        );
      }
      return {
        workflowId,
        workflowUrl: temporalNamespace
          ? `https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${workflowId}`
          : undefined,
      };
    }
    case "upsert-pages": {
      if (!args.connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      if (!args.file) {
        throw new Error("Missing --file argument");
      }
      if (!args.keyInFile) {
        throw new Error("Missing --keyInFile argument");
      }
      const connectorId = args.connectorId;
      const file = args.file;
      const keyInFile = args.keyInFile;

      // parsing the JSON file
      const fileContent = await fs.readFile(file, "utf-8");
      const jsonArray = JSON.parse(fileContent);
      assert(Array.isArray(jsonArray), "The file content is not an array.");

      const pageIds = jsonArray.map((entry) => {
        assert(
          keyInFile in entry,
          `Key "${keyInFile}" not found in entry ${JSON.stringify(entry)}`
        );
        return entry[keyInFile];
      });

      const client = await getTemporalClient();
      const workflow = await client.workflow.start(
        confluenceUpsertPagesWithFullParentsWorkflow,
        {
          args: [{ connectorId, pageIds }],
          taskQueue: QUEUE_NAME,
          workflowId: `confluence-upsert-pages-${connectorId}`,
          searchAttributes: { connectorId: [connectorId] },
          memo: { connectorId },
        }
      );

      const { workflowId } = workflow;
      const temporalNamespace = process.env.TEMPORAL_NAMESPACE;
      if (!temporalNamespace) {
        logger.info(`[Admin] Started temporal workflow with id: ${workflowId}`);
      } else {
        logger.info(
          `[Admin] Started temporal workflow with id: ${workflowId} - https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${workflowId}`
        );
      }
      return {
        workflowId,
        workflowUrl: temporalNamespace
          ? `https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${workflowId}`
          : undefined,
      };
    }
    case "update-parents": {
      if (!args.connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      // Not passing a spaceId means that all spaces have to be checked out here.
      if (!args.spaceId) {
        const spaces = await ConfluenceSpace.findAll({
          attributes: ["spaceId"],
          where: { connectorId: args.connectorId },
        });
        for (const space of spaces) {
          logger.info(
            { spaceId: space.spaceId },
            "Updating parents for space."
          );
          await confluenceUpdatePagesParentIdsActivity(
            args.connectorId,
            space.spaceId,
            null
          );
        }
      } else {
        await confluenceUpdatePagesParentIdsActivity(
          args.connectorId,
          args.spaceId.toString(),
          null
        );
      }
      return { success: true };
    }
    case "ignore-near-rate-limit": {
      const { connectorId } = args;
      if (!connectorId) {
        throw new Error("Missing --connectorId argument");
      }

      const configuration = await ConfluenceConfiguration.findOne({
        where: {
          connectorId,
        },
      });
      if (!configuration) {
        throw new Error(
          `Confluence configuration not found (connectorId: ${args.connectorId})`
        );
      }

      await configuration.update({ ignoreNearRateLimit: true });

      return { success: true };
    }
    case "unignore-near-rate-limit": {
      const { connectorId } = args;
      if (!connectorId) {
        throw new Error("Missing --connectorId argument");
      }

      const configuration = await ConfluenceConfiguration.findOne({
        where: {
          connectorId,
        },
      });
      if (!configuration) {
        throw new Error(
          `Confluence configuration not found (connectorId: ${args.connectorId})`
        );
      }

      await configuration.update({ ignoreNearRateLimit: false });

      return { success: true };
    }

    case "check-space-access": {
      const { connectorId } = args;
      if (!connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      if (!args.spaceId) {
        throw new Error("Missing --spaceId argument");
      }
      const spaceId = args.spaceId.toString();

      const connector = await ConnectorResource.fetchById(connectorId);
      if (!connector) {
        throw new Error("Connector not found.");
      }
      if (connector.type !== "confluence") {
        throw new Error("Connector is not a Confluence connector.");
      }

      const confluenceConfig =
        await fetchConfluenceConfigurationActivity(connectorId);
      const client = await getConfluenceClient(
        { cloudId: confluenceConfig?.cloudId },
        connector
      );

      // Let errors propagate naturally
      const space = await client.getSpaceById(spaceId);
      return {
        hasAccess: true,
        space,
      };
    }

    case "resolve-space-from-url": {
      const { connectorId } = args;
      if (!connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      if (!args.url) {
        throw new Error("Missing --url argument");
      }

      const connector = await ConnectorResource.fetchById(connectorId);
      if (!connector) {
        throw new Error("Connector not found.");
      }
      if (connector.type !== "confluence") {
        throw new Error("Connector is not a Confluence connector.");
      }

      // Parse space key from URL
      const spaceKeyMatch = args.url.match(/\/wiki\/spaces\/([^/]+)/);
      if (!spaceKeyMatch) {
        return {
          found: false,
        };
      }
      const spaceKey = spaceKeyMatch[1];

      // List all spaces in the connector to find matching space
      const spacesResult = await listConfluenceSpaces(connector);
      if (spacesResult.isErr()) {
        throw new Error(`Failed to list spaces: ${spacesResult.error.message}`);
      }

      const matchingSpace = spacesResult.value.find(
        (space) => space.key === spaceKey
      );
      if (!matchingSpace) {
        return {
          found: false,
        };
      }

      // Test access to the space
      const confluenceConfig =
        await fetchConfluenceConfigurationActivity(connectorId);
      const client = await getConfluenceClient(
        { cloudId: confluenceConfig?.cloudId },
        connector
      );

      let hasAccess = false;
      try {
        await client.getSpaceById(matchingSpace.id);
        hasAccess = true;
      } catch (error) {
        logger.info(
          { spaceId: matchingSpace.id, error },
          "Space access check failed"
        );
      }

      // Get space information from database
      const dbSpace = await ConfluenceSpace.findOne({
        where: {
          connectorId,
          spaceId: matchingSpace.id,
        },
      });

      // Count pages in this space
      const pageCount = await ConfluencePage.count({
        where: {
          connectorId,
          spaceId: matchingSpace.id,
        },
      });

      return {
        found: true,
        spaceId: matchingSpace.id,
        spaceKey: matchingSpace.key,
        spaceName: matchingSpace.name,
        hasAccess,
        lastSyncedAt: dbSpace?.updatedAt?.toISOString(),
        pageCount,
      };
    }

    case "sync-space": {
      if (!args.connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      if (!args.spaceId) {
        throw new Error("Missing --spaceId argument");
      }
      const { connectorId } = args;
      const spaceId = args.spaceId.toString();
      const forceUpsert = args.forceUpsert === "true";

      const client = await getTemporalClient();
      const workflow = await client.workflow.start(
        confluenceSpaceSyncWorkflow,
        {
          args: [
            {
              connectorId,
              isBatchSync: true,
              spaceId,
              forceUpsert,
            },
          ],
          taskQueue: QUEUE_NAME,
          workflowId: `confluence-sync-space-${connectorId}-${spaceId}`,
          searchAttributes: { connectorId: [connectorId] },
          memo: { connectorId },
        }
      );

      const { workflowId } = workflow;
      const temporalNamespace = process.env.TEMPORAL_NAMESPACE;
      if (!temporalNamespace) {
        logger.info(`[Admin] Started temporal workflow with id: ${workflowId}`);
      } else {
        logger.info(
          `[Admin] Started temporal workflow with id: ${workflowId} - https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${workflowId}`
        );
      }
      return {
        workflowId,
        workflowUrl: temporalNamespace
          ? `https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${workflowId}`
          : undefined,
      };
    }

    default:
      throw new Error("Unknown Confluence command: " + command);
  }
};
