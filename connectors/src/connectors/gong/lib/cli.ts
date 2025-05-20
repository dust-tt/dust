import { makeGongForceResyncWorkflowId } from "@connectors/connectors/gong";
import { fetchGongConnector } from "@connectors/connectors/gong/lib/utils";
import { QUEUE_NAME } from "@connectors/connectors/gong/temporal/config";
import { gongSyncTranscriptsWorkflow } from "@connectors/connectors/gong/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import { default as topLogger } from "@connectors/logger/logger";
import type {
  GongCommandType,
  GongForceResyncResponseType,
} from "@connectors/types";

export const gong = async ({
  command,
  args,
}: GongCommandType): Promise<GongForceResyncResponseType> => {
  const logger = topLogger.child({ majorCommand: "gong", command, args });
  switch (command) {
    case "force-resync": {
      if (!args.connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      const { connectorId } = args;

      const connector = await fetchGongConnector({ connectorId });
      if (connector.type !== "gong") {
        throw new Error("Connector is not a Gong connector.");
      }

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

    default:
      throw new Error(`Unknown Gong command: ${command}`);
  }
};
