import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { ConnectorProvider } from "@app/types/data_source";
import type { WorkspaceType } from "@app/types/user";
import { faker } from "@faker-js/faker";

export class DataSourceViewFactory {
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  static async folder(
    workspace: WorkspaceType,
    space: SpaceResource,
    editedByUser?: UserResource | null
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
      editedByUser
    );
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  static async fromConnector(
    workspace: WorkspaceType,
    space: SpaceResource,
    connectorProvider: ConnectorProvider,
    editedByUser?: UserResource | null
  ) {
    return DataSourceViewResource.createDataSourceAndDefaultView(
      {
        name: "datasource " + faker.string.alphanumeric(8),
        assistantDefaultSelected: false,
        dustAPIProjectId: "dust-project-id" + faker.string.alphanumeric(8),
        dustAPIDataSourceId:
          "dust-datasource-id" + faker.string.alphanumeric(8),
        workspaceId: workspace.id,
        connectorProvider: connectorProvider,
      },
      space,
      editedByUser
    );
  }
}
