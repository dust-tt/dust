import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { DataSource } from "@app/lib/models";
import { DataSourceType } from "@app/types/data_source";

export async function getDataSource(
  auth: Authenticator,
  name: string
): Promise<DataSourceType | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }

  const dataSource = await DataSource.findOne({
    where: auth.isUser()
      ? {
          workspaceId: owner.id,
          visibility: {
            [Op.or]: ["public", "private", "unlisted"],
          },
          name,
        }
      : {
          workspaceId: owner.id,
          // Do not include 'unlisted' here.
          visibility: "public",
          name,
        },
  });

  if (!dataSource) {
    return null;
  }

  return {
    name: dataSource.name,
    description: dataSource.description,
    visibility: dataSource.visibility,
    config: dataSource.config,
    dustAPIProjectId: dataSource.dustAPIProjectId,
    connectorId: dataSource.connectorId,
    connectorProvider: dataSource.connectorProvider,
  };
}

export async function getDataSources(
  auth: Authenticator
): Promise<DataSourceType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }

  let dataSources = await DataSource.findAll({
    where: auth.isUser()
      ? {
          workspaceId: owner.id,
          visibility: {
            [Op.or]: ["public", "private", "unlisted"],
          },
        }
      : {
          workspaceId: owner.id,
          // Do not include 'unlisted' here.
          visibility: "public",
        },
    order: [["updatedAt", "DESC"]],
  });

  return dataSources.map((dataSource): DataSourceType => {
    return {
      name: dataSource.name,
      description: dataSource.description,
      visibility: dataSource.visibility,
      config: dataSource.config,
      dustAPIProjectId: dataSource.dustAPIProjectId,
      connectorId: dataSource.connectorId,
      connectorProvider: dataSource.connectorProvider,
    };
  });
}
