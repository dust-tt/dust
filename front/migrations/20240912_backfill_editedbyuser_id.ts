import assert from "assert";
import { Op } from "sequelize";

import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { getWorkspaceFirstAdmin } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

makeScript({}, async ({ execute }, logger) => {
  const dataSources: DataSourceModel[] = await DataSourceModel.findAll({
    where: {
      editedByUserId: {
        [Op.is]: null,
      },
    },
  });

  for (const ds of dataSources) {
    const workspace = await WorkspaceResource.fetchByModelId(ds.workspaceId);
    assert(workspace, `Failed to find workspace for dataSource ${ds.id}`);

    const oldestAdminMembership = await getWorkspaceFirstAdmin(workspace);

    if (!oldestAdminMembership) {
      logger.error(
        {
          workspaceId: workspace.id,
        },
        "Workspace has no admin"
      );
      return;
    }

    if (execute) {
      await ds.update({
        editedByUserId: oldestAdminMembership.id,
      });
      logger.info(
        {
          workspaceId: workspace.id,
          dataSourceId: ds.id,
          editedByUserId: oldestAdminMembership.id,
        },
        "Updated data source"
      );
    } else {
      logger.info(
        {
          workspaceId: workspace.id,
          dataSourceId: ds.id,
          editedByUserId: oldestAdminMembership.id,
        },
        "Would have updated data source"
      );
    }
  }
});
