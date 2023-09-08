import { existsSync, readFileSync, writeFileSync } from "fs";
import { Op } from "sequelize";

import { updateDocumentParentsField } from "@connectors/lib/data_sources";
import { Connector, SlackMessages } from "@connectors/lib/models";

async function main() {
  if (!process.argv[2]) {
    console.error("Missing workspace id or 'all' as first argument");
    process.exit(1);
  }
  // if first arg is "all", update all connectors, else update only the
  // connector for the corresponding workspace id

  let connectors = [];
  // get connectors already done from JSON array in a file called
  // "done-connector-ids.json"; create it if needed with an empty array
  if (!existsSync("./done-connector-ids.json")) {
    writeFileSync("./done-connector-ids.json", JSON.stringify([]));
  }
  const doneConnectorIds = JSON.parse(
    readFileSync("./done-connector-ids.json", "utf-8")
  );
  if (process.argv[2] === "all") {
    // get all connectors that are not done yet
    connectors = await Connector.findAll({
      where: {
        type: "slack",
        id: {
          [Op.notIn]: doneConnectorIds,
        },
      },
    });
  } else {
    connectors = await Connector.findAll({
      where: {
        type: "slack",
        workspaceId: process.argv[2],
      },
    });
  }
  for (const connector of connectors) {
    console.log(`Updating parents field for connector ${connector.id}`);
    await updateParentsFieldForConnector(connector);
    /// add connector id to JSON array in a file called
    /// "done-connector-ids.json"
    doneConnectorIds.push(connector.id);
    console.log(".");
    writeFileSync(
      "./done-connector-ids.json",
      JSON.stringify(doneConnectorIds)
    );
  }
}

async function updateParentsFieldForConnector(connector: Connector) {
  // get all distinct documentIds and their channel ids from slack messages in
  // this connector
  const documentIdsAndChannels = await SlackMessages.findAll({
    where: {
      connectorId: connector.id,
    },
    attributes: ["documentId", "channelId"],
    group: ["documentId", "channelId"],
  });
  // update all parents fields for all pages and databases by chunks of 128
  const chunkSize = 32;
  for (let i = 0; i < documentIdsAndChannels.length; i += chunkSize) {
    const chunk = documentIdsAndChannels.slice(i, i + chunkSize);
    process.stdout.write(".");
    // update parents field for each document of the chunk, in parallel
    await Promise.all(
      chunk.map(
        async (documentIdAndChannel) =>
          await updateDocumentParentsField(
            connector,
            documentIdAndChannel.documentId,
            [documentIdAndChannel.channelId]
          )
      )
    );
  }
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
