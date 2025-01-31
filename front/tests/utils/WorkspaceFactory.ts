import { faker } from "@faker-js/faker";

import { Workspace } from "@app/lib/models/workspace";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";

export class WorkspaceFactory {
  static async basic() {
    return Workspace.create({
      sId: generateRandomModelSId(),
      name: faker.company.name(),
      description: faker.company.catchPhrase(),
    });
  }
}
