import type {
  AdminSuccessResponseType,
  ConfluenceCommandType,
  ConfluenceUpsertPageResponseType,
} from "@dust-tt/types";
import assert from "assert";
import fs from "fs/promises";

import { QUEUE_NAME } from "@connectors/connectors/confluence/temporal/config";
import {
  confluenceUpsertPagesWithFullParentsWorkflow,
  confluenceUpsertPageWithFullParentsWorkflow,
} from "@connectors/connectors/confluence/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import { default as topLogger } from "@connectors/logger/logger";

export const confluence = async ({
  command,
  args,
}: ConfluenceCommandType): Promise<
  AdminSuccessResponseType | ConfluenceUpsertPageResponseType
> => {
  const logger = topLogger.child({ majorCommand: "confluence", command, args });
  switch (command) {
    case "upsert-page": {
      if (!args.connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      if (!args.pageId) {
        throw new Error("Missing --pageId argument");
      }
      const { connectorId, pageId } = args;

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

    default:
      throw new Error("Unknown Confluence command: " + command);
  }
};
