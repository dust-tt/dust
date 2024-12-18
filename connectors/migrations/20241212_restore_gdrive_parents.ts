import * as fs from "fs";
import * as readline from "readline";
import { makeScript } from "scripts/helpers";

import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { updateDataSourceDocumentParents } from "@connectors/lib/data_sources";
import logger from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

interface LogEntry {
  msg: string;
  documentId: string;
  parents: string[];
  previousParents: string[];
}

async function processLogFile(
  connector: ConnectorModel,
  filePath: string,
  execute: boolean
) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  for await (const line of rl) {
    const entry = JSON.parse(line) as LogEntry;
    const { msg, documentId, previousParents } = entry;
    if (
      msg === "Update parents for document" &&
      documentId &&
      previousParents
    ) {
      logger.info(
        { documentId, previousParents },
        "Restoring parent for document"
      );
      if (execute) {
        await updateDataSourceDocumentParents({
          dataSourceConfig,
          documentId: documentId,
          parents: previousParents,
        });
      }
    }
  }
}

makeScript(
  {
    connectorId: { type: "number", required: true },
    file: { type: "string", required: true },
  },
  async ({ connectorId, file, execute }) => {
    const connector = await ConnectorModel.findByPk(connectorId);
    if (connector) {
      await processLogFile(connector, file, execute);
    }
  }
);
