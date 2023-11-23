import { existsSync, readFileSync, writeFileSync } from "fs";
import { Op } from "sequelize";

import { updateAllParentsFields } from "@connectors/connectors/notion/lib/parents";
import { Connector } from "@connectors/lib/models";
import { NotionDatabase, NotionPage } from "@connectors/lib/models/notion";

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
        type: "notion",
        id: {
          [Op.notIn]: doneConnectorIds,
        },
      },
    });
  } else {
    connectors = await Connector.findAll({
      where: {
        type: "notion",
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
  // get all pages and databases for this connector
  const pages = await NotionPage.findAll({
    where: {
      connectorId: connector.id,
    },
  });
  const databases = await NotionDatabase.findAll({
    where: {
      connectorId: connector.id,
    },
  });

  // update all parents fields for all pages and databases
  await updateAllParentsFields(
    connector.id,
    pages.map((p) => p.notionPageId),
    databases.map((d) => d.notionDatabaseId)
  );
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
