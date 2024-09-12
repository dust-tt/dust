import assert from "assert";
import { Op } from "sequelize";

import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { DataSource } from "@app/lib/resources/storage/models/data_source";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  const dataSources = await DataSource.findAll({
    where: {
      editedByUserId: {
        [Op.is]: undefined,
      },
      connectorProvider: {
        [Op.not]: undefined,
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

    const oldestAdminMembership = await MembershipModel.findOne({
      where: {
        workspaceId: workspace.id,
        role: "admin",
        endAt: null,
      },
      order: [["startAt", "ASC"]],
      include: [
        {
          model: User,
          attributes: ["id", "username", "email"],
        },
      ],
    });

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
        editedByUserId: oldestAdminMembership.userId,
      });
      logger.info(
        {
          workspaceId: workspace.id,
          dataSourceId: ds.id,
          editedByUserId: oldestAdminMembership.userId,
        },
        "Updated data source"
      );
    } else {
      logger.info(
        {
          workspaceId: workspace.id,
          dataSourceId: ds.id,
          editedByUserId: oldestAdminMembership.userId,
        },
        "Would have updated data source"
      );
    }
  }
});
