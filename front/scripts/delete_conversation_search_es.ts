import {
  CONVERSATION_SEARCH_ALIAS_NAME,
  getClient,
} from "@app/lib/api/elasticsearch";
import { makeScript } from "@app/scripts/helpers";
import { errors as esErrors } from "@elastic/elasticsearch";
import * as readline from "readline";

const INDEX_PATTERN = `${CONVERSATION_SEARCH_ALIAS_NAME}*`;

async function listConversationSearchIndices(): Promise<string[]> {
  const client = await getClient();
  const indices = new Set<string>();

  try {
    const aliasResponse = await client.indices.getAlias({
      name: CONVERSATION_SEARCH_ALIAS_NAME,
    });
    for (const index of Object.keys(aliasResponse)) {
      indices.add(index);
    }
  } catch (err) {
    if (!(err instanceof esErrors.ResponseError && err.statusCode === 404)) {
      throw err;
    }
  }

  try {
    const indicesResponse = await client.indices.get({
      index: INDEX_PATTERN,
      ignore_unavailable: true,
    });
    for (const index of Object.keys(indicesResponse)) {
      indices.add(index);
    }
  } catch (err) {
    if (!(err instanceof esErrors.ResponseError && err.statusCode === 404)) {
      throw err;
    }
  }

  return [...indices].sort();
}

/**
 * Deletes the conversation search Elasticsearch index and alias.
 *
 * Follow-up cleanup for https://github.com/dust-tt/dust/pull/28208, which
 * removed the application read/write paths for `front.conversation_search`.
 *
 * Usage:
 * tsx front/scripts/delete_conversation_search_es.ts
 * tsx front/scripts/delete_conversation_search_es.ts --execute
 * tsx front/scripts/delete_conversation_search_es.ts --execute --skipConfirmation
 */
makeScript(
  {
    skipConfirmation: {
      type: "boolean",
      describe: "Skip interactive confirmation when using --execute",
      default: false,
    },
  },
  async ({ execute, skipConfirmation }, logger) => {
    const indices = await listConversationSearchIndices();

    if (indices.length === 0) {
      logger.info(
        {
          alias: CONVERSATION_SEARCH_ALIAS_NAME,
          indexPattern: INDEX_PATTERN,
        },
        "No conversation search indices found in Elasticsearch."
      );
      return;
    }

    const client = await getClient();
    const stats = await client.indices.stats({
      index: indices.join(","),
    });

    const documentCounts = indices.map((index) => ({
      index,
      documentCount: stats.indices?.[index]?.total?.docs?.count ?? 0,
    }));

    logger.info(
      {
        alias: CONVERSATION_SEARCH_ALIAS_NAME,
        indices: documentCounts,
      },
      execute
        ? "Will delete conversation search indices."
        : "[DRY RUN] Would delete conversation search indices."
    );

    if (!execute) {
      return;
    }

    if (!skipConfirmation) {
      logger.info(
        `CHECK: Delete conversation search indices ${indices.join(", ")}? (y to confirm)`
      );

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question("", (input) => {
          rl.close();
          resolve(input.trim());
        });
      });

      if (answer !== "y") {
        throw new Error("Aborted");
      }
    }

    for (const index of indices) {
      logger.info({ index }, "Deleting index...");
      await client.indices.delete({
        index,
        ignore_unavailable: true,
      });
      logger.info({ index }, "Deleted index.");
    }

    logger.info(
      {
        alias: CONVERSATION_SEARCH_ALIAS_NAME,
        deletedIndices: indices,
      },
      "Conversation search Elasticsearch cleanup complete."
    );
  }
);
