import { existsSync, readFileSync, writeFileSync } from "fs";
import { Op } from "sequelize";

import {
  getDiscussionInternalId,
  getIssueInternalId,
} from "@connectors/connectors/github/lib/utils";
import { updateDocumentParentsField } from "@connectors/lib/data_sources";
import { GithubDiscussion, GithubIssue } from "@connectors/lib/models/github";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

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
    connectors = await ConnectorModel.findAll({
      where: {
        type: "github",
        id: {
          [Op.notIn]: doneConnectorIds,
        },
      },
    });
  } else {
    connectors = await ConnectorModel.findAll({
      where: {
        type: "github",
        workspaceId: process.argv[2],
      },
    });
  }

  for (const connector of connectors) {
    console.log(`Updating parents field for connector ${connector.id}`);
    await updateDiscussionsParentsFieldForConnector(connector);
    await updateIssuesParentsFieldForConnector(connector);
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

async function updateDiscussionsParentsFieldForConnector(
  connector: ConnectorModel
) {
  // get all distinct documentIds and their channel ids from slack messages in
  // this connector
  const documentData = await GithubDiscussion.findAll({
    where: {
      connectorId: connector.id,
    },
    attributes: ["repoId", "discussionNumber"],
  });
  // update all parents fields for discussions by chunks of 128
  const chunkSize = 32;
  for (let i = 0; i < documentData.length; i += chunkSize) {
    const chunk = documentData.slice(i, i + chunkSize);
    // update parents field for each document of the chunk, in parallel
    await Promise.all(
      chunk.map(async (document) => {
        const docId = getDiscussionInternalId(
          document.repoId,
          document.discussionNumber
        );
        await updateDocumentParentsField({
          dataSourceConfig: connector,
          documentId: docId,
          parents: [
            getDiscussionInternalId(document.repoId, document.discussionNumber),
            document.repoId,
          ],
        });
      })
    );
    process.stdout.write(".");
  }
}

async function updateIssuesParentsFieldForConnector(connector: ConnectorModel) {
  // get all distinct issues  and their repo ids fro
  const documentData = await GithubIssue.findAll({
    where: {
      connectorId: connector.id,
    },
    attributes: ["repoId", "issueNumber"],
  });
  // update all parents fields for all issues by chunks of 128
  const chunkSize = 32;
  for (let i = 0; i < documentData.length; i += chunkSize) {
    const chunk = documentData.slice(i, i + chunkSize);
    // update parents field for each document of the chunk, in parallel
    await Promise.all(
      chunk.map(async (document) => {
        const docId = getIssueInternalId(document.repoId, document.issueNumber);
        await updateDocumentParentsField({
          dataSourceConfig: connector,
          documentId: docId,
          parents: [
            getIssueInternalId(document.repoId, document.issueNumber),
            document.repoId,
          ],
        });
      })
    );
    process.stdout.write(".");
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
