import { Err, Ok } from "@dust-tt/types";

import { createPlugin } from "@app/lib/api/poke/types";
import { createRegularSpaceAndGroup } from "@app/lib/api/spaces";

export const createSpacePlugin = createPlugin({
  manifest: {
    id: "create-space",
    name: "Create a Space",
    description: "Create a new space",
    resourceTypes: ["workspaces"],
    args: {
      name: {
        type: "string",
        label: "Name",
        description: "Name of the space",
      },
      isRestricted: {
        type: "boolean",
        label: "Is Restricted",
        description: "Is the space restricted",
      },
      ignoreWorkspaceLimit: {
        type: "boolean",
        label: "Ignore Workspace Limit",
        description: "Ignore workspace limit",
      },
    },
  },
  execute: async (auth, _, args) => {
    const { name, isRestricted } = args;

    const formattedName = name.trim();
    if (formattedName.length === 0) {
      return new Err(new Error("Name cannot be empty"));
    }

    const spaceRes = await createRegularSpaceAndGroup(
      auth,
      { name: formattedName, memberIds: [], isRestricted },
      {
        ignoreWorkspaceLimit: args.ignoreWorkspaceLimit,
      }
    );

    if (spaceRes.isErr()) {
      return new Err(new Error(spaceRes.error.message));
    }

    const space = spaceRes.value;

    return new Ok({
      display: "text",
      value: `Space ${space.name} created successfully`,
    });
  },
});
