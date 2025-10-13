import { isLeft } from "fp-ts/lib/Either";
import fs from "fs";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { getConnectorManager } from "@connectors/connectors";
import { getClient } from "@connectors/connectors/microsoft";
import {
  getItem,
  getParentReferenceInternalId,
} from "@connectors/connectors/microsoft/lib/graph_api";
import type { DriveItem } from "@connectors/connectors/microsoft/lib/types";
import { DRIVE_ITEM_EXPANDS_AND_SELECTS } from "@connectors/connectors/microsoft/lib/types";
import {
  getColumnsFromListItem,
  markInternalIdAsSkipped,
  typeAndPathFromInternalId,
} from "@connectors/connectors/microsoft/lib/utils";
import { syncFiles } from "@connectors/connectors/microsoft/temporal/activities";
import { launchMicrosoftIncrementalSyncWorkflow } from "@connectors/connectors/microsoft/temporal/client";
import { getParents } from "@connectors/connectors/microsoft/temporal/file";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { throwOnError } from "@connectors/lib/cli";
import {
  updateDataSourceDocumentParents,
  updateDataSourceTableParents,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import { terminateWorkflow } from "@connectors/lib/temporal";
import logger, { getActivityLogger } from "@connectors/logger/logger";
import { MicrosoftNodeResource } from "@connectors/resources/microsoft_resource";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type {
  AdminSuccessResponseType,
  CheckFileGenericResponseType,
  MicrosoftCommandType,
} from "@connectors/types";
import {
  INTERNAL_MIME_TYPES,
  microsoftIncrementalSyncWorkflowId,
} from "@connectors/types";

/**
 * Parse internal IDs from either a JSON file or a single internal ID argument
 * @param idsFile - Path to JSON file containing array of string IDs
 * @param internalId - Single internal ID string
 * @returns Array of internal ID strings
 */
function parseInternalIds(idsFile?: string, internalId?: string): string[] {
  if (idsFile) {
    // Read ids from JSON file
    if (!fs.existsSync(idsFile)) {
      throw new Error(`Ids file not found: ${idsFile}`);
    }

    try {
      const fileContent = fs.readFileSync(idsFile, "utf8");
      const parsedIds = JSON.parse(fileContent);

      // Validate using io-ts schema
      const validation = t.array(t.string).decode(parsedIds);

      if (isLeft(validation)) {
        const pathError = reporter.formatValidationErrors(validation.left);
        throw new Error(`Invalid permissions file format: ${pathError}`);
      }

      return validation.right;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in permissions file: ${error.message}`);
      }
      throw error;
    }
  } else {
    if (!internalId) {
      throw new Error("Missing --internalId argument");
    }
    return [internalId];
  }
}

const getConnector = async (args: { [key: string]: string | undefined }) => {
  if (args.wId) {
    const connector = await ConnectorModel.findOne({
      where: {
        workspaceId: `${args.wId}`,
        type: "microsoft",
      },
    });
    if (!connector) {
      throw new Error(`Could not find connector for workspace ${args.wId}`);
    }
    return connector;
  }
  if (args.connectorId) {
    const connector = await ConnectorModel.findOne({
      where: {
        id: args.connectorId,
      },
    });
    if (!connector) {
      throw new Error(
        `Could not find connector for connectorId ${args.connectorId}`
      );
    }
    return connector;
  }
  throw new Error("Missing --connectorId or --wId argument");
};

export const microsoft = async ({
  command,
  args,
}: MicrosoftCommandType): Promise<
  AdminSuccessResponseType | CheckFileGenericResponseType
> => {
  switch (command) {
    case "garbage-collect-all": {
      const connectors = await ConnectorModel.findAll({
        where: {
          type: "microsoft",
        },
      });
      for (const connector of connectors) {
        await throwOnError(
          getConnectorManager({
            connectorId: connector.id,
            connectorProvider: "microsoft",
          }).garbageCollect()
        );
      }
      return { success: true };
    }
    case "check-file": {
      const connector = await getConnector(args);
      if (!args.internalId) {
        throw new Error("Missing --internalId argument");
      }

      const { nodeType, itemAPIPath } = typeAndPathFromInternalId(
        args.internalId
      );
      const logger = getActivityLogger(connector);
      const client = await getClient(connector.connectionId);
      const driveItem = (await getItem(
        logger,
        client,
        itemAPIPath + nodeType === "file"
          ? `?${DRIVE_ITEM_EXPANDS_AND_SELECTS}`
          : ""
      )) as DriveItem;

      const columns = await getColumnsFromListItem(
        driveItem,
        driveItem.listItem?.fields,
        client,
        logger
      );

      const microsoftNodeResource =
        await MicrosoftNodeResource.fetchByInternalId(
          connector.id,
          args.internalId
        );
      const content = {
        nodeType,
        itemAPIPath,
        microsoftNodeResource: microsoftNodeResource?.toJSON(),
        driveItem,
        columns,
      };

      return { status: 200, content, type: typeof content };
    }

    case "sync-node": {
      const connector = await getConnector(args);
      if (!args.internalId) {
        throw new Error("Missing --internalId argument");
      }

      const node = await MicrosoftNodeResource.fetchByInternalId(
        connector.id,
        args.internalId
      );

      if (!node) {
        throw new Error(
          `Could not find node for internalId ${args.internalId}`
        );
      }

      let parentInternalId = node.parentInternalId;
      if (node.nodeType === "file") {
        logger.info(`Node ${args.internalId} is a file, syncing its parent.`);

        if (!parentInternalId) {
          throw new Error(
            `Node ${args.internalId} is a file, but has no parentInternalId`
          );
        }

        const parent = await MicrosoftNodeResource.fetchByInternalId(
          connector.id,
          parentInternalId
        );
        if (!parent) {
          throw new Error(
            `Could not find parent node for internalId ${parentInternalId}`
          );
        }

        if (parent.nodeType === "drive") {
          throw new Error(
            `Node ${args.internalId} is a file, but its parent is a drive. We only allow syncing files from a folder to avoid syncing the whole drive.`
          );
        }
      } else {
        parentInternalId = node.internalId;
      }

      const startSyncTs = Date.now();
      let nextPageLink = undefined;
      let totalCount = 0;
      let nodeIdsToSync = [parentInternalId];
      while (nodeIdsToSync.length > 0) {
        const nodeId = nodeIdsToSync.pop();
        if (!nodeId) {
          break;
        }

        do {
          const res = await syncFiles({
            connectorId: connector.id,
            parentInternalId: nodeId,
            startSyncTs,
            nextPageLink,
          });
          totalCount += res.count;
          nodeIdsToSync = nodeIdsToSync.concat(res.childNodes);
          nextPageLink = res.nextLink;
        } while (nextPageLink);
      }

      return { status: 200, content: { totalCount }, type: typeof totalCount };
    }

    case "update-parent-in-node-table": {
      const connector = await getConnector(args);
      const { internalId, idsFile } = args;

      const internalIds = parseInternalIds(idsFile, internalId);

      // Get node from MS Graph API.
      const client = await getClient(connector.connectionId);

      for (const internalId of internalIds) {
        const node = await MicrosoftNodeResource.fetchByInternalId(
          connector.id,
          internalId
        );

        if (!node) {
          throw new Error(`Could not find node for internalId ${internalId}`);
        }
        const driveItem: DriveItem = await getItem(
          logger,
          client,
          typeAndPathFromInternalId(internalId).itemAPIPath
        );
        // Get parent reference from driveItem.
        if (driveItem && !driveItem.root && driveItem.parentReference) {
          const parentInternalId = getParentReferenceInternalId(
            driveItem.parentReference
          );

          if (parentInternalId === node.parentInternalId) {
            logger.info(
              { internalId: node.internalId, parentInternalId },
              "Parent internalId is the same as the node's parentInternalId, nothing to update"
            );
          } else {
            logger.info(
              {
                internalId: node.internalId,
                previousValue: node.parentInternalId,
                parentInternalId,
              },
              "Updating parentInternalId"
            );
            const parentNode = await MicrosoftNodeResource.fetchByInternalId(
              connector.id,
              parentInternalId
            );

            if (!parentNode) {
              logger.info(
                { internalId: node.internalId, parentInternalId },
                "Parent does not exist, skipping"
              );
            } else {
              await node.update({ parentInternalId });
            }
          }
        } else {
          logger.info({ driveItem }, "Node not found, nothing to update");
        }
      }
      return { success: true };
    }

    case "update-core-parents": {
      const connector = await getConnector(args);
      const { internalId, idsFile } = args;
      const internalIds = parseInternalIds(idsFile, internalId);
      const dataSourceConfig = dataSourceConfigFromConnector(connector);

      const cacheKey = Date.now();
      for (const internalId of internalIds) {
        const node = await MicrosoftNodeResource.fetchByInternalId(
          connector.id,
          internalId
        );
        if (!node) {
          logger.error(`Could not find node for internalId ${internalId}`);
        } else {
          const localParents = await getParents({
            connectorId: connector.id,
            internalId,
            startSyncTs: cacheKey,
          });
          if (node.nodeType === "file") {
            await updateDataSourceDocumentParents({
              dataSourceConfig,
              documentId: node.internalId,
              parents: localParents,
              parentId: localParents[1] ?? null,
            });
          } else if (node.nodeType === "worksheet") {
            await updateDataSourceTableParents({
              dataSourceConfig,
              tableId: node.internalId,
              parents: localParents,
              parentId: localParents[1] ?? null,
            });
          } else {
            await upsertDataSourceFolder({
              dataSourceConfig,
              folderId: node.internalId,
              parents: localParents,
              parentId: localParents[1] ?? null,
              title: node.name ?? "Untitled Folder",
              mimeType: INTERNAL_MIME_TYPES.MICROSOFT.FOLDER,
              sourceUrl: node.webUrl ?? undefined,
            });
          }
        }
      }

      return { success: true };
    }

    case "start-incremental-sync": {
      const connector = await getConnector(args);

      await throwOnError(launchMicrosoftIncrementalSyncWorkflow(connector.id));
      return { success: true };
    }
    case "restart-all-incremental-sync-workflows": {
      const connectors = await ConnectorModel.findAll({
        where: {
          type: "microsoft",
          errorType: null,
          pausedAt: null,
        },
      });
      for (const connector of connectors) {
        const workflowId = microsoftIncrementalSyncWorkflowId(connector.id);
        await terminateWorkflow(workflowId);
        await throwOnError(
          launchMicrosoftIncrementalSyncWorkflow(connector.id)
        );
      }
      return { success: true };
    }

    case "skip-file": {
      const connector = await getConnector(args);
      const logger = getActivityLogger(connector);
      const { internalId, idsFile } = args;

      const internalIds = parseInternalIds(idsFile, internalId);

      const client = await getClient(connector.connectionId);

      for (const internalId of internalIds) {
        const { nodeType, itemAPIPath } = typeAndPathFromInternalId(internalId);
        if (nodeType !== "file") {
          throw new Error(
            `Can only skip file, got ${nodeType} / ${itemAPIPath}`
          );
        }

        const file = (await getItem(
          logger,
          client,
          itemAPIPath + `?${DRIVE_ITEM_EXPANDS_AND_SELECTS}`
        )) as DriveItem;

        if (!file) {
          throw new Error(`Could not find file with internalId ${internalId}`);
        }

        if (!file.parentReference) {
          throw new Error(`No parentReference found`);
        }

        const parentInternalId = getParentReferenceInternalId(
          file.parentReference
        );

        await markInternalIdAsSkipped({
          internalId,
          connectorId: connector.id,
          parentInternalId,
          reason: args.reason,
          file,
        });
      }

      return { success: true };
    }

    default:
      throw new Error("Unknown microsoft command: " + command);
  }
};
