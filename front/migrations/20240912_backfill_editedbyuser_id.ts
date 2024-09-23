import assert from "assert";
import { Op } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { getWorkspaceFirstAdmin } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  const dataSources = await DataSourceModel.findAll({
    // @ts-expect-error Model has been updated, editedByUserId is not nullable.
    where: {
      editedByUserId: {
        [Op.is]: null,
      },
    },
  });

  for (const ds of dataSources) {
    const workspace = await Workspace.findOne({
      where: {
        id: ds.workspaceId,
      },
    });
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
