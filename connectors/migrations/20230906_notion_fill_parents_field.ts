import { updateAllParentsFields } from "@connectors/connectors/notion/lib/parents";
import { Connector, NotionDatabase, NotionPage } from "@connectors/lib/models";

async function main() {
  if (!process.argv[2]) {
    console.error("Missing workspace id or 'all' as first argument");
    process.exit(1);
  }
  // if first arg is "all", update all connectors, else update only the
  // connector for the corresponding workspace id
  const connectors =
    process.argv[2] === "all"
      ? await Connector.findAll({
          where: {
            type: "notion",
          },
        })
      : await Connector.findAll({
          where: {
            type: "notion",
            workspaceId: process.argv[2],
          },
        });

  for (const connector of connectors) {
    console.log(`Updating parents field for connector ${connector.id}`);
    await updateParentsFieldForConnector(connector);
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
  await updateAllParentsFields(connector, [...pages, ...databases]);
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
