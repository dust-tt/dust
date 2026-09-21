import { AppResource } from "@app/lib/resources/app_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import type { LightWorkspaceType } from "@app/types/user";
import { faker } from "@faker-js/faker";

export class AppFactory {
  static async basic(workspace: LightWorkspaceType, space: SpaceResource) {
    return AppResource.makeNew(
      {
        description: "Test app",
        dustAPIProjectId: "dust-api-project-id",
        name: "Test App " + faker.string.alphanumeric(8),
        savedConfig: "{}",
        savedSpecification: "[]",
        sId: generateRandomModelSId(),
        visibility: "private",
        workspaceId: workspace.id,
      },
      space
    );
  }
}
