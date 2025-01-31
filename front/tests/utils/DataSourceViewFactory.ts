import { faker } from "@faker-js/faker";
import type { Transaction } from "sequelize";

import type { Workspace } from "@app/lib/models/workspace";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";

export class DataSourceViewFactory {
  static async folder(
    workspace: Workspace,
    space: SpaceResource,
    t: Transaction
  ) {
    return DataSourceViewResource.createDataSourceAndDefaultView(
      {
        name: "datasource " + faker.string.alphanumeric(8),
        assistantDefaultSelected: false,
        dustAPIProjectId: "dust-project-id" + faker.string.alphanumeric(8),
        dustAPIDataSourceId:
          "dust-datasource-id" + faker.string.alphanumeric(8),
        workspaceId: workspace.id,
      },
      space,
      null,
      t
    );
  }
}
