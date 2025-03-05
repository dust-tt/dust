import type {
  AdminSuccessResponseType,
  CheckFileGenericResponseType,
  MicrosoftCommandType,
} from "@dust-tt/types";
import { microsoftIncrementalSyncWorkflowId } from "@dust-tt/types";

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
  typeAndPathFromInternalId,
} from "@connectors/connectors/microsoft/lib/utils";
import { syncFiles } from "@connectors/connectors/microsoft/temporal/activities";
import { launchMicrosoftIncrementalSyncWorkflow } from "@connectors/connectors/microsoft/temporal/client";
import { throwOnError } from "@connectors/lib/cli";
import { terminateWorkflow } from "@connectors/lib/temporal";
import logger, { getActivityLogger } from "@connectors/logger/logger";
import { MicrosoftNodeResource } from "@connectors/resources/microsoft_resource";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

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

      const columns = await getColumnsFromListItem(driveItem, client, logger);

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
      if (!args.internalId) {
        throw new Error("Missing --internalId argument");
      }

      const { nodeType, itemAPIPath } = typeAndPathFromInternalId(
        args.internalId
      );
      if (nodeType !== "file") {
        throw new Error(`Can only skip file, got ${nodeType} / ${itemAPIPath}`);
      }

      const client = await getClient(connector.connectionId);
      const file = (await getItem(
        logger,
        client,
        itemAPIPath + `?${DRIVE_ITEM_EXPANDS_AND_SELECTS}`
      )) as DriveItem;

      if (!file) {
        throw new Error(
          `Could not find file with internalId ${args.internalId}`
        );
      }

      if (!file.parentReference) {
        throw new Error(`No parentReference found`);
      }

      const parentInternalId = getParentReferenceInternalId(
        file.parentReference
      );

      file.parentReference?.driveId, file.parentReference?.id;
      const existingFile = await MicrosoftNodeResource.fetchByInternalId(
        connector.id,
        args.internalId
      );

      if (existingFile) {
        await existingFile.update({
          skipReason: args.reason || "blacklisted",
        });
      } else {
        await MicrosoftNodeResource.makeNew({
          internalId: args.internalId,
          connectorId: connector.id,
          nodeType: "file",
          name: file.name ?? "unknown",
          mimeType: file.file?.mimeType ?? "unknown",
          parentInternalId,
          skipReason: args.reason || "blacklisted",
          webUrl: file.webUrl ?? null,
        });
      }

      return { success: true };
    }

    default:
      throw new Error("Unknown microsoft command: " + command);
  }
};
