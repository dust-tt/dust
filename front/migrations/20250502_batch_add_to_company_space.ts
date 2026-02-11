import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { CoreAPI } from "@app/types/core/core_api";

const BATCH_SIZE = 1000;

async function getParentsToAdd({
  slackDataSource,
  namePrefix,
  execute,
  logger,
}: {
  slackDataSource: DataSourceResource;
  namePrefix: string;
  execute: boolean;
  logger: Logger;
}) {
  const coreApi = new CoreAPI(config.getCoreAPIConfig(), logger);

  let nextPageCursor;
  const allNodes = [];
  let nodes;

  do {
    const searchResult = await coreApi.searchNodes({
      query: namePrefix,
      filter: {
        data_source_views: [
          {
            data_source_id: slackDataSource.dustAPIDataSourceId,
            search_scope: "nodes_titles",
            view_filter: [],
          },
        ],
        node_types: ["folder"],
      },
      options: { limit: BATCH_SIZE, cursor: nextPageCursor },
    });
    if (searchResult.isErr()) {
      throw searchResult.error;
    }

    // The Elasticsearch analyzer splits punctuation (like '#inc-') into tokens,
    // causing the search to match documents containing the prefix anywhere in the title,
    // not just at the beginning. This post-search filter ensures we only get
    // documents whose titles actually start with the specified prefix.
    const filteredNodes = searchResult.value.nodes.filter((node: any) =>
      node.title.toLowerCase().startsWith(namePrefix.toLowerCase())
    );

    nodes = filteredNodes;

    if (execute) {
      logger.info(`Found ${nodes.length} parents to add.`);
    } else {
      logger.info(
        { titles: nodes.map((n) => n.title) },
        `Found ${nodes.length} parents to add.`
      );
    }

    allNodes.push(...nodes);
    nextPageCursor = searchResult.value.next_page_cursor;
  } while (nextPageCursor && nodes.length === BATCH_SIZE);

  return allNodes.map((node) => node.node_id);
}

async function addParentsToDataSourceView({
  dataSourceView,
  parentsToAdd,
  execute,
  logger,
}: {
  dataSourceView: DataSourceViewResource;
  parentsToAdd: string[];
  execute: boolean;
  logger: Logger;
}) {
  const currentParents = dataSourceView.parentsIn || [];
  logger.info(
    {
      currentParents,
      parentsToAdd,
      dataSourceViewId: dataSourceView.sId,
      dataSourceViewModelId: dataSourceView.id,
    },
    "Preparing to add parent node IDs to data source view."
  );

  if (execute) {
    await dataSourceView.setParents([
      ...new Set([...currentParents, ...parentsToAdd]),
    ]);
    logger.info(`Added ${parentsToAdd.length} parents to data source view.`);
  } else {
    logger.info(
      `Would have added ${parentsToAdd.length} parents to data source view.`
    );
  }
}

makeScript(
  {
    wId: { type: "string", description: "Workspace ID" },
    namePrefix: {
      type: "string",
      description: "Prefix to filter channel names",
      required: true,
    },
  },
  async ({ execute, wId, namePrefix }, parentLogger) => {
    const logger = parentLogger.child({
      wId,
      namePrefix,
    });

    const auth = await Authenticator.internalAdminForWorkspace(wId);
    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    const [slackDataSource] = await DataSourceResource.listByConnectorProvider(
      auth,
      "slack"
    );
    if (!slackDataSource) {
      throw new Error(`Slack data source not found.`);
    }
    const [dataSourceView] =
      await DataSourceViewResource.listForDataSourcesInSpace(
        auth,
        [slackDataSource],
        globalSpace
      );
    if (!dataSourceView) {
      throw new Error(`Data source view not found.`);
    }

    const parentsToAdd = await getParentsToAdd({
      slackDataSource,
      namePrefix,
      execute,
      logger,
    });

    await addParentsToDataSourceView({
      dataSourceView,
      parentsToAdd,
      execute,
      logger,
    });
  }
);
