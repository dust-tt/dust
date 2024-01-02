import {
  getDiscussionDocumentId,
  getIssueDocumentId,
} from "@connectors/connectors/github/temporal/activities";
import { updateDocumentParentsField } from "@connectors/lib/data_sources";
import { Connector } from "@connectors/lib/models";
import { GithubDiscussion, GithubIssue } from "@connectors/lib/models/github";

const { LIVE = null } = process.env;

async function main() {
  const connectors = await Connector.findAll({
    where: {
      type: "github",
    },
  });

  for (const connector of connectors) {
    console.log(`>> Updating connector: ${connector.id}`);
    await updateParents(connector);
  }
}

const CHUNK_SIZE = 32;

async function updateParents(connector: Connector) {
  const discussions = await GithubDiscussion.findAll({
    where: {
      connectorId: connector.id,
    },
  });

  const discussionChunks = [];
  for (let i = 0; i < discussions.length; i += CHUNK_SIZE) {
    discussionChunks.push(discussions.slice(i, i + CHUNK_SIZE));
  }

  for (const chunk of discussionChunks) {
    await Promise.all(
      chunk.map(async (d) => {
        const documentId = getDiscussionDocumentId(
          d.repoId,
          d.discussionNumber
        );
        const parents = [documentId, `${d.repoId}-discussions`, d.repoId];
        if (LIVE) {
          await updateDocumentParentsField({
            dataSourceConfig: connector,
            documentId,
            parents,
          });
          console.log(`Updated discussion ${documentId} with: ${parents}`);
        } else {
          console.log(`Would update ${documentId} with: ${parents}`);
        }
      })
    );
  }

  const issues = await GithubIssue.findAll({
    where: {
      connectorId: connector.id,
    },
  });

  const issueChunks = [];
  for (let i = 0; i < issues.length; i += CHUNK_SIZE) {
    issueChunks.push(issues.slice(i, i + CHUNK_SIZE));
  }

  for (const chunk of issueChunks) {
    await Promise.all(
      chunk.map(async (i) => {
        const documentId = getIssueDocumentId(i.repoId, i.issueNumber);
        const parents = [documentId, `${i.repoId}-issues`, i.repoId];
        if (LIVE) {
          await updateDocumentParentsField({
            dataSourceConfig: connector,
            documentId,
            parents,
          });
          console.log(`Updated issue ${documentId} with: ${parents}`);
        } else {
          console.log(`Would update ${documentId} with: ${parents}`);
        }
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
