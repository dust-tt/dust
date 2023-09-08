import {
  getDiscussionDocumentId,
  getIssueDocumentId,
} from "@connectors/connectors/github/temporal/activities";
import { updateDocumentParentsField } from "@connectors/lib/data_sources";
import {
  Connector,
  GithubDiscussion,
  GithubIssue,
} from "@connectors/lib/models";

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
            type: "github",
          },
        })
      : await Connector.findAll({
          where: {
            type: "github",
            workspaceId: process.argv[2],
          },
        });

  for (const connector of connectors) {
    console.log(`Updating parents field for connector ${connector.id}`);
    await updateDiscussionsParentsFieldForConnector(connector);
    await updateIssuesParentsFieldForConnector(connector);
  }
}

async function updateDiscussionsParentsFieldForConnector(connector: Connector) {
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
    console.log(`Updating ${chunk.length} documents`);
    // update parents field for each document of the chunk, in parallel
    await Promise.all(
      chunk.map(async (document) => {
        const docId = getDiscussionDocumentId(
          document.repoId,
          document.discussionNumber
        );
        await updateDocumentParentsField(connector, docId, [
          getDiscussionDocumentId(document.repoId, document.discussionNumber),
          document.repoId,
        ]);
      })
    );
  }
}

async function updateIssuesParentsFieldForConnector(connector: Connector) {
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
    console.log(`Updating ${chunk.length} documents`);
    // update parents field for each document of the chunk, in parallel
    await Promise.all(
      chunk.map(async (document) => {
        const docId = getIssueDocumentId(document.repoId, document.issueNumber);
        await updateDocumentParentsField(connector, docId, [
          getIssueDocumentId(document.repoId, document.issueNumber),
          document.repoId,
        ]);
      })
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
