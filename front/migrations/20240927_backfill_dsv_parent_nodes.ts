import * as fs from "fs";
import * as _ from "lodash";

import { getContentNodesForDataSourceView } from "@app/lib/api/data_source_view";
import { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  let revertScript = "";
  let revertScriptFailingConnectors = "";

  const dataSourceViews = await DataSourceViewModel.findAll({
    where: {
      parentsIn: null,
      kind: "custom",
    },
  });

  logger.info(`Found ${dataSourceViews.length} data source views to process`);

  for (const dataSourceView of dataSourceViews) {
    const workspace = await Workspace.findOne({
      where: { id: dataSourceView.workspaceId },
    });

    if (!workspace) {
      logger.warn(`Couldn't find workspace ${dataSourceView.workspaceId}`);
      continue;
    }
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const dsvSId = DataSourceViewResource.modelIdToSId({
      id: dataSourceView.id,
      workspaceId: workspace.id,
    });
    const dataSourceViewResource = await DataSourceViewResource.fetchById(
      auth,
      dsvSId
    );

    if (!dataSourceViewResource) {
      logger.warn(`DataSourceView not found for id ${dataSourceView.id}`);
      continue;
    }

    let rootNodeIds: string[] = [];

    try {
      const contentNodesDocumentsRes = await getContentNodesForDataSourceView(
        dataSourceViewResource,
        {
          viewType: "documents",
        }
      );
      const contentNodesTablesRes = await getContentNodesForDataSourceView(
        dataSourceViewResource,
        {
          viewType: "tables",
        }
      );

      if (contentNodesDocumentsRes.isOk() && contentNodesTablesRes.isOk()) {
        const rootNodesDocuments = contentNodesDocumentsRes.value.nodes;
        const rootNodesTables = contentNodesTablesRes.value.nodes;

        const rootNodes = _.uniqBy(
          [...rootNodesDocuments, ...rootNodesTables],
          "internalId"
        );

        rootNodeIds = rootNodes.map((node) => node.internalId);
      }
    } catch (err) {
      logger.error(
        `Error fetching content nodes for data source view ${dataSourceView.id}: ${err}`
      );
    }

    const revertQuery = `UPDATE data_source_views SET "parentsIn"=${JSON.stringify(dataSourceView.parentsIn)} WHERE id=${dataSourceView.id};`;
    if (rootNodeIds.length > 0) {
      revertScript += revertQuery + "\n";
    } else {
      revertScriptFailingConnectors += revertQuery + "\n";
    }

    if (execute) {
      await dataSourceView.update({
        parentsIn: rootNodeIds,
      });
      logger.info(
        `Updated data source view ${dataSourceView.id} with ${rootNodeIds.length} root nodes`
      );
    } else {
      logger.info(
        `Would update data source view ${dataSourceView.id} with ${rootNodeIds.length} root nodes`
      );
    }
  }
  fs.writeFileSync(
    "revert_20240927_backfill_dsv_parent_nodes.sql",
    revertScript
  );
  fs.writeFileSync(
    "revert_20240927_backfill_dsv_parent_nodes_failed_connectors.sql",
    revertScriptFailingConnectors
  );
});
