import { makeGongForceResyncWorkflowId } from "@connectors/connectors/gong";
import { makeGongTranscriptInternalId } from "@connectors/connectors/gong/lib/internal_ids";
import {
  fetchGongConfiguration,
  fetchGongConnector,
} from "@connectors/connectors/gong/lib/utils";
import { QUEUE_NAME } from "@connectors/connectors/gong/temporal/config";
import { gongSyncTranscriptsWorkflow } from "@connectors/connectors/gong/temporal/workflows";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { deleteDataSourceDocument } from "@connectors/lib/data_sources";
import { getTemporalClient } from "@connectors/lib/temporal";
import { default as topLogger } from "@connectors/logger/logger";
import { GongTranscriptResource } from "@connectors/resources/gong_resources";
import type {
  GongCommandType,
  GongDeleteTranscriptResponseType,
  GongForceResyncResponseType,
} from "@connectors/types";

export const gong = async ({
  command,
  args,
}: GongCommandType): Promise<
  GongForceResyncResponseType | GongDeleteTranscriptResponseType
> => {
  const logger = topLogger.child({ majorCommand: "gong", command, args });
  switch (command) {
    case "force-resync": {
      const { connectorId, fromTs } = args;
      if (!connectorId) {
        throw new Error("Missing --connectorId argument");
      }

      const connector = await fetchGongConnector({ connectorId });
      if (connector.type !== "gong") {
        throw new Error("Connector is not a Gong connector.");
      }
      const configuration = await fetchGongConfiguration(connector);

      // If fromTs is not provided, reset the last sync timestamp to run a full sync.
      if (fromTs === undefined) {
        await configuration.resetLastSyncTimestamp();
      } else {
        await configuration.setLastSyncTimestamp(fromTs);
      }

      // Run a full sync workflow.
      const client = await getTemporalClient();
      const workflow = await client.workflow.start(
        gongSyncTranscriptsWorkflow,
        {
          args: [{ connectorId: connector.id, forceResync: true }],
          taskQueue: QUEUE_NAME,
          workflowId: makeGongForceResyncWorkflowId(connector),
          searchAttributes: { connectorId: [connector.id] },
          memo: { connectorId: connector.id },
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

    case "delete-transcript": {
      const { connectorId, callId: callIdArg } = args;
      if (!connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      if (!callIdArg) {
        throw new Error("Missing --callId argument");
      }

      const callId = callIdArg.toString();

      const connector = await fetchGongConnector({ connectorId });
      if (connector.type !== "gong") {
        throw new Error("Connector is not a Gong connector.");
      }

      const transcript = await GongTranscriptResource.fetchByCallId(
        callId,
        connector
      );
      if (!transcript) {
        throw new Error(
          `Transcript with callId ${callId} not found for connector ${connectorId}.`
        );
      }

      const dataSourceConfig = dataSourceConfigFromConnector(connector);

      await deleteDataSourceDocument(
        dataSourceConfig,
        makeGongTranscriptInternalId(connector, callId),
        {
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceId: dataSourceConfig.dataSourceId,
          provider: "gong",
          callId,
        }
      );

      await transcript.delete();

      logger.info(
        { connectorId, callId },
        "[Admin] Transcript deleted successfully."
      );
      return { callId };
    }

    default:
      throw new Error(`Unknown Gong command: ${command}`);
  }
};
