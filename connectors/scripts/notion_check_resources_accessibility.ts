/**
 * Script to check the accessibility of Notion pages and databases.
 *
 * Usage:
 *   npm run script notion_check_resources_accessibility -- -c <connectorId> -f <file_path>
 *
 * File format: CSV with columns notion_id,type
 *   - First row is header (notion_id,type)
 *   - type must be either 'page' or 'database'
 *
 * Example CSV content:
 *   notion_id,type
 *   8a7b5c3d-1234-5678-90ab-cdef12345678,page
 *   abc123de-f456-7890-1234-567890123456,page
 *   12345678-9012-3456-7890-abcdef123456,database
 *
 * The script will launch a Temporal workflow that checks each resource
 * and logs whether it's accessible using the connector's token.
 * 
 * The script returns immediately after starting the workflow and provides
 * a link to the Temporal UI to monitor progress.
 */
import { readFile } from "fs/promises";

import { QUEUE_NAME } from "@connectors/connectors/notion/temporal/config";
import { checkResourcesAccessibilityWorkflow } from "@connectors/connectors/notion/temporal/workflows/check_resources_accessibility";
import { getTemporalClient } from "@connectors/lib/temporal";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

import { makeScript } from "./helpers";


makeScript(
  {
    connectorId: {
      alias: "c",
      type: "string" as const,
      demandOption: true,
      describe: "The Notion connector ID",
    },
    file: {
      alias: "f",
      type: "string" as const,
      demandOption: true,
      describe: "Path to a CSV file with columns: notion_id,type",
    },
  },
  async (argv, logger) => {
    const { execute, connectorId: connectorIdString, file: filePath } = argv;
    const connectorId = parseInt(connectorIdString, 10) as ModelId;

    // Read and parse CSV file
    let fileContent: string;
    try {
      fileContent = await readFile(filePath, "utf-8");
    } catch (error) {
      logger.error({ filePath, error }, "Failed to read file");
      throw new Error(`Failed to read file: ${filePath}`);
    }

    const lines = fileContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      throw new Error("CSV file is empty");
    }

    // Check header
    const header = lines[0]?.toLowerCase();
    if (!header || !header.includes("notion_id") || !header.includes("type")) {
      throw new Error(
        "Invalid CSV format. Expected header with columns: notion_id,type"
      );
    }

    // Parse and validate all resources
    const resources: Array<{
      resourceId: string;
      resourceType: "page" | "database";
    }> = [];

    // Iterate over lines, skipping header
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        continue;
      } // Skip undefined lines

      const parts = line.split(",").map((p) => p.trim());

      if (parts.length !== 2) {
        throw new Error(
          `Invalid CSV format on line ${i + 1}: '${line}'. Expected: notion_id,type`
        );
      }

      const [rawId, type] = parts;
      if (!rawId || !type) {
        throw new Error(
          `Missing data on line ${i + 1}: '${line}'. Both notion_id and type are required`
        );
      }

      if (type !== "page" && type !== "database") {
        throw new Error(
          `Invalid type on line ${i + 1}: '${type}'. Must be 'page' or 'database'`
        );
      }

      resources.push({
        resourceId: rawId,
        resourceType: type as "page" | "database",
      });
    }

    logger.info(
      {
        filePath,
        totalLines: lines.length - 1, // Exclude header
        validResources: resources.length,
      },
      "Parsed resources from CSV file"
    );

    logger.info(
      {
        connectorId,
        resourceCount: resources.length,
        resources,
      },
      "Starting resource accessibility check"
    );

    if (!execute) {
      logger.info("Dry run mode - not executing workflow");
      return;
    }

    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }

    const connectionId = connector.connectionId;

    const temporalClient = await getTemporalClient();
    const workflowId = `notion-check-resources-accessibility-${connectorId}-${Date.now()}`;

    logger.info(
      {
        workflowId,
        connectorId,
        connectionId,
        resourceCount: resources.length,
      },
      "Starting Temporal workflow"
    );

    const handle = await temporalClient.workflow.start(
      checkResourcesAccessibilityWorkflow,
      {
        args: [
          {
            connectorId,
            connectionId,
            resources,
          },
        ],
        taskQueue: QUEUE_NAME,
        workflowId,
      }
    );

    const temporalNamespace = process.env.TEMPORAL_NAMESPACE;
    
    if (temporalNamespace) {
      const workflowUrl = `https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${handle.workflowId}`;
      logger.info(
        {
          workflowId: handle.workflowId,
          runId: handle.firstExecutionRunId,
          workflowUrl,
        },
        "Workflow started successfully"
      );
      console.log(`\nTemporal UI: ${workflowUrl}\n`);
    } else {
      logger.info(
        {
          workflowId: handle.workflowId,
          runId: handle.firstExecutionRunId,
        },
        "Workflow started successfully"
      );
    }
  }
);
