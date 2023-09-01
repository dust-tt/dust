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
    id: dataSource.id,
    name: dataSource.name,
    description: dataSource.description ?? undefined,
    visibility: dataSource.visibility,
    config: dataSource.config ?? undefined,
    dustAPIProjectId: dataSource.dustAPIProjectId,
    connectorId: dataSource.connectorId ?? undefined,
    connectorProvider: dataSource.connectorProvider ?? undefined,
    assistantDefaultSelected: dataSource.assistantDefaultSelected,
  };
}

export async function getDataSources(
  auth: Authenticator
): Promise<DataSourceType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }

  const dataSources = await DataSource.findAll({
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
      id: dataSource.id,
      name: dataSource.name,
      description: dataSource.description ?? undefined,
      visibility: dataSource.visibility,
      config: dataSource.config ?? undefined,
      dustAPIProjectId: dataSource.dustAPIProjectId,
      connectorId: dataSource.connectorId ?? undefined,
      connectorProvider: dataSource.connectorProvider ?? undefined,
      assistantDefaultSelected: dataSource.assistantDefaultSelected,
    };
  });
}
