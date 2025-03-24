import { faker } from "@faker-js/faker";
import type { Transaction } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { WorkspaceType } from "@app/types";

export class WorkspaceFactory {
  static async basic(t?: Transaction): Promise<WorkspaceType> {
    const workspace = await Workspace.create(
      {
        sId: generateRandomModelSId(),
        name: faker.company.name(),
        description: faker.company.catchPhrase(),
      },
      {
        transaction: t,
      }
    );
    return {
      ...renderLightWorkspaceType({ workspace }),
      ssoEnforced: workspace.ssoEnforced,
    };
  }
}
