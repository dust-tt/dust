/**
 * Script to test Intercom search API pagination behavior with different sort orders.
 *
 * Usage:
 *   npx tsx scripts/intercom_test_search_pagination.ts --connectorId=809 --maxResults=200000 --output=/tmp/conversations.csv
 *   npx tsx scripts/intercom_test_search_pagination.ts --connectorId=809 --maxResults=200000 --sortBy=created_at --sortOrder=asc --output=/tmp/conversations_sorted.csv
 *   npx tsx scripts/intercom_test_search_pagination.ts --connectorId=809 --maxResults=1000 --teamId=50027710 --output=/tmp/team_conversations.csv
 */
import * as fs from "fs";
import { makeScript } from "scripts/helpers";

import { getIntercomAccessToken } from "@connectors/connectors/intercom/lib/intercom_access_token";
import { fetchIntercomConversations } from "@connectors/connectors/intercom/lib/intercom_api";
import { IntercomWorkspaceModel } from "@connectors/lib/models/intercom";
import { ConnectorResource } from "@connectors/resources/connector_resource";

makeScript(
  {
    connectorId: {
      alias: "c",
      type: "number",
      demandOption: true,
      describe: "The Intercom connector ID",
    },
    maxResults: {
      alias: "m",
      type: "number",
      demandOption: true,
      describe: "Maximum number of results to fetch",
    },
    sortBy: {
      alias: "s",
      type: "string",
      describe:
        "Sort field (e.g., created_at, updated_at, last_request_at). If not specified, uses Intercom default (last_request_at desc)",
    },
    sortOrder: {
      alias: "o",
      type: "string",
      describe: "Sort order: asc or desc",
    },
    teamId: {
      alias: "t",
      type: "string",
      describe: "Filter by team ID",
    },
    output: {
      alias: "out",
      type: "string",
      demandOption: true,
      describe: "Output CSV file path",
    },
  },
  async (argv, logger) => {
    const { connectorId, maxResults, sortBy, sortOrder, teamId, output } = argv;

    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }
    if (connector.type !== "intercom") {
      throw new Error(`Connector ${connectorId} is not an Intercom connector`);
    }

    const accessToken = await getIntercomAccessToken(connector.connectionId);

    const workspace = await IntercomWorkspaceModel.findOne({
      where: { connectorId: connector.id },
    });

    if (!workspace) {
      throw new Error(`No workspace found for connector ${connector.id}`);
    }

    function getSortOrder(
      order: string
    ): "ascending" | "descending" | undefined {
      if (order === "asc") {
        return "ascending";
      }
      if (order === "desc") {
        return "descending";
      }
      return undefined;
    }

    const sortOrderValue = sortOrder ? getSortOrder(sortOrder) : undefined;
    const sort =
      sortBy && sortOrderValue
        ? {
            field: sortBy,
            order: sortOrderValue,
          }
        : undefined;

    let cursor: string | null = null;
    let totalFetched = 0;
    let pagesProcessed = 0;

    const conversations: {
      id: string;
      created_at: number;
      updated_at: number;
      last_closed_at: number | null;
      team_assignee_id: string | null;
      open: boolean;
      state: string;
    }[] = [];

    logger.info(
      {
        connectorId,
        maxResults,
        sortBy: sortBy ?? "default (last_request_at)",
        sortOrder: sortOrder ?? "default (desc)",
        teamId: teamId ?? "none",
        slidingWindow: workspace.conversationsSlidingWindow,
      },
      "Starting search pagination test"
    );

    const startTime = Date.now();

    while (totalFetched < maxResults) {
      const response = await fetchIntercomConversations({
        accessToken,
        teamId,
        slidingWindow: workspace.conversationsSlidingWindow,
        cursor,
        pageSize: 50,
        sort,
      });

      pagesProcessed++;

      if (response.conversations.length === 0) {
        break;
      }

      for (const conv of response.conversations) {
        conversations.push({
          id: conv.id,
          created_at: conv.created_at,
          updated_at: conv.updated_at,
          last_closed_at: conv.statistics?.last_close_at ?? null,
          team_assignee_id: conv.team_assignee_id?.toString() ?? null,
          open: conv.open,
          state: conv.state,
        });
        totalFetched++;
        if (totalFetched >= maxResults) {
          break;
        }
      }

      if (response.pages.next) {
        cursor = response.pages.next.starting_after;
      } else {
        break;
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const firstInPage = response.conversations[0];
      const lastInPage = response.conversations[response.conversations.length - 1];
      logger.info(
        {
          page: pagesProcessed,
          pageSize: response.conversations.length,
          totalFetched,
          elapsedSeconds: elapsed,
          firstInPage: firstInPage
            ? {
                id: firstInPage.id,
                created_at: firstInPage.created_at,
                updated_at: firstInPage.updated_at,
                team_assignee_id: firstInPage.team_assignee_id,
              }
            : null,
          lastInPage: lastInPage
            ? {
                id: lastInPage.id,
                created_at: lastInPage.created_at,
                updated_at: lastInPage.updated_at,
                team_assignee_id: lastInPage.team_assignee_id,
              }
            : null,
          hasMore: !!response.pages.next,
        },
        "Page fetched"
      );
    }

    const stoppedReason =
      totalFetched >= maxResults ? "maxResults" : "noMorePages";
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // Write CSV
    const csvHeader =
      "id,created_at,updated_at,last_closed_at,team_assignee_id,open,state";
    const csvRows = conversations.map(
      (c) =>
        `${c.id},${c.created_at},${c.updated_at},${c.last_closed_at ?? ""},${c.team_assignee_id ?? ""},${c.open},${c.state}`
    );
    const csvContent = [csvHeader, ...csvRows].join("\n");
    fs.writeFileSync(output, csvContent);

    const result = {
      totalFetched,
      pagesProcessed,
      stoppedReason,
      elapsedSeconds: elapsed,
      outputFile: output,
      firstConversation: conversations[0] ?? null,
      lastConversation: conversations[conversations.length - 1] ?? null,
      config: {
        sortBy: sortBy ?? null,
        sortOrder: sortOrder ?? null,
        teamId: teamId ?? null,
        slidingWindow: workspace.conversationsSlidingWindow,
      },
    };

    logger.info(result, "Search pagination test completed");

    console.log("\n" + JSON.stringify(result, null, 2) + "\n");
  }
);
