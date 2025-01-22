import { faker } from "@faker-js/faker";
import type { InferCreationAttributes } from "sequelize";

import type { Workspace } from "@app/lib/models/workspace";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type { SpaceModel } from "@app/lib/resources/storage/models/spaces";

import { Factory } from "./factories";

class DataSourceFactory extends Factory<DataSourceModel> {
  constructor() {
    super({
      name: "datasource " + faker.string.alphanumeric(8),
      editedAt: new Date(),
      assistantDefaultSelected: false,
      dustAPIProjectId: "dust-project-id" + faker.string.alphanumeric(8),
      dustAPIDataSourceId: "dust-datasource-id" + faker.string.alphanumeric(8),
    });
  }

  async make(params: InferCreationAttributes<DataSourceModel>) {
    return DataSourceModel.create(params);
  }

  folder(workspace: Workspace, space: SpaceModel) {
    return this.params({
      workspaceId: workspace.id,
      vaultId: space.id,
    });
  }
}

export const dataSourceFactory = () => {
  return new DataSourceFactory();
};
