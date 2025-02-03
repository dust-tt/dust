import { faker } from "@faker-js/faker";

import { Workspace } from "@app/lib/models/workspace";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { renderLightWorkspaceType } from "@app/lib/workspace";

export class WorkspaceFactory {
  static async basic() {
    const workspace = await Workspace.create({
      sId: generateRandomModelSId(),
      name: faker.company.name(),
      description: faker.company.catchPhrase(),
    });
    return renderLightWorkspaceType({ workspace });
  }
}
