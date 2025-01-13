import { faker } from "@faker-js/faker";
import type { InferCreationAttributes } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";

import { Factory } from "./factories";

class WorkspaceFactory extends Factory<Workspace> {
  async make(params: InferCreationAttributes<Workspace>) {
    return Workspace.create(params);
  }

  basic() {
    return this.params({
      sId: generateRandomModelSId(),
      name: faker.company.name(),
      description: faker.company.catchPhrase(),
    });
  }
}

export const workspaceFactory = () => {
  return new WorkspaceFactory();
};
