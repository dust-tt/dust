import type { InferCreationAttributes } from "sequelize";

import type { Workspace } from "@app/lib/models/workspace";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import type { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { dataSourceFactory } from "@app/tests/utils/DataSourceFactory";

import { Factory } from "./factories";

class DataSourceViewFactory extends Factory<DataSourceViewModel> {
  constructor() {
    super({
      editedAt: new Date(),
      kind: "default",
      parentsIn: null,
    });
  }

  async make(params: InferCreationAttributes<DataSourceViewModel>) {
    if (!params.dataSourceId) {
      // As a convenience, if the dataSourceId is not provided, we create a new data source
      const dataSource = await dataSourceFactory().create({
        workspaceId: params.workspaceId,
        vaultId: params.vaultId,
      });
      params.dataSourceId = dataSource.id;
      params.kind = "default";
    }
    return DataSourceViewModel.create(params);
  }

  folder(workspace: Workspace, space: SpaceModel) {
    return this.params({
      workspaceId: workspace.id,
      vaultId: space.id,
    });
  }
}

export const dataSourceViewFactory = () => {
  return new DataSourceViewFactory();
};
