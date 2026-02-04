/**
 * Script to check the accessibility of Notion pages and databases.
 *
 * Usage:
 *   npm run script notion_check_resources_accessibility -- -c <connectorId> -f <file_path> -n <name>
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
 * The script will:
 * 1. Split the CSV into chunks of 8k resources
 * 2. Upload chunks to GCS as separate CSV files
 * 3. Launch a Temporal workflow with the list of GCS file paths
 * 4. The workflow will process each file sequentially using continue-as-new
 * 5. Return immediately with a link to the Temporal UI
 */

import { QUEUE_NAME } from "@connectors/connectors/notion/temporal/config";
import { checkResourcesAccessibilityWorkflow } from "@connectors/connectors/notion/temporal/workflows/check_resources_accessibility";
import { connectorsConfig } from "@connectors/connectors/shared/config";
import { getTemporalClient } from "@connectors/lib/temporal";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { isDevelopment } from "@connectors/types";
import { Storage } from "@google-cloud/storage";
import { readFile } from "fs/promises";
import { makeScript } from "scripts/helpers";

makeScript(
  {
    connectorId: {
      alias: "c",
      type: "string",
      demandOption: true,
      describe: "The Notion connector ID",
    },
    file: {
      alias: "f",
      type: "string",
      demandOption: true,
      describe: "Path to a CSV file with columns: notion_id,type",
    },
    name: {
      alias: "n",
      type: "string",
      demandOption: true,
      describe: "The name suffix for the workflow",
    },
  },
  async (argv, logger) => {
    const {
      execute,
      connectorId: connectorIdString,
      file: filePath,
      name,
    } = argv;
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

    // Validate we have resources to process
    if (resources.length === 0) {
      throw new Error("No valid resources found in CSV file");
    }

    // Split resources into chunks of 8k
    const CHUNK_SIZE = 8000;
    const chunks: Array<typeof resources> = [];
    for (let i = 0; i < resources.length; i += CHUNK_SIZE) {
      chunks.push(resources.slice(i, i + CHUNK_SIZE));
    }

    logger.info(
      {
        totalResources: resources.length,
        chunkSize: CHUNK_SIZE,
        numberOfChunks: chunks.length,
      },
      "Split resources into chunks"
    );

    if (!execute) {
      logger.info("Dry run mode - not uploading to GCS or executing workflow");
      return;
    }

    // Initialize GCS
    const storage = new Storage({
      keyFilename: isDevelopment()
        ? connectorsConfig.getServiceAccount()
        : undefined,
    });
    const bucket = storage.bucket(connectorsConfig.getDustTmpSyncBucketName());
    const gcsPrefix = `notion-check-accessibility/${connectorId}/${name}/${Date.now()}`;

    // Upload chunks to GCS and collect file paths
    logger.info({ gcsPrefix }, "Uploading chunks to GCS");
    const gcsFilePaths: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk || chunk.length === 0) {
        throw new Error(`Empty chunk at index ${i} - this should never happen`);
      }
      const csvLines = ["notion_id,type"];
      for (const resource of chunk) {
        csvLines.push(`${resource.resourceId},${resource.resourceType}`);
      }

      const fileName = `${gcsPrefix}/chunk_${i}.csv`;
      await bucket.file(fileName).save(csvLines.join("\n"), {
        metadata: {
          contentType: "text/csv",
          metadata: {
            dustInternal: "notion-accessibility-check",
            connectorId: connectorId.toString(),
            chunkIndex: i.toString(),
            resourceCount: chunk.length.toString(),
          },
        },
      });

      // Add the file path to the list
      gcsFilePaths.push(fileName);

      logger.info(
        {
          chunkIndex: i,
          fileName,
          resourceCount: chunk.length,
        },
        "Uploaded chunk to GCS"
      );
    }

    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }

    const temporalClient = await getTemporalClient();
    const workflowId = `notion-check-resources-accessibility-${connectorId}-${name}`;

    // Final validation before launching workflow
    if (gcsFilePaths.length === 0) {
      throw new Error("No GCS files were created - cannot start workflow");
    }

    logger.info(
      {
        workflowId,
        connectorId,
        resourceCount: resources.length,
        numberOfChunks: chunks.length,
        gcsFilePaths: gcsFilePaths.length,
      },
      "Starting Temporal workflow"
    );

    const handle = await temporalClient.workflow.start(
      checkResourcesAccessibilityWorkflow,
      {
        args: [
          {
            connectorId,
            gcsFilePaths,
          },
        ],
        taskQueue: QUEUE_NAME,
        workflowId,
        searchAttributes: {
          connectorId: [connectorId],
        },
        memo: {
          connectorId,
        },
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
