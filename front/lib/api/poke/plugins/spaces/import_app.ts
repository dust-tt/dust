import { readFileSync } from "fs";

import { createPlugin } from "@app/lib/api/poke/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { importApp } from "@app/lib/utils/apps";
import { Err, Ok } from "@app/types";

export const importAppPlugin = createPlugin({
  manifest: {
    id: "import-app",
    name: "Import dust-app",
    description: "Import a dust-app",
    resourceTypes: ["spaces"],
    args: {
      file: {
        type: "file",
        label: "File to import",
        description: "The file to import",
      },
    },
  },
  execute: async (auth, space, args) => {
    const { file } = args;
    const fileContent = readFileSync(file.filepath, "utf-8");
    const appData = JSON.parse(fileContent);
    if (!space) {
      return new Err(new Error("Space not found"));
    }
    const spaceResource = await SpaceResource.fetchById(auth, space.sId);
    if (!spaceResource) {
      return new Err(new Error("Space not found"));
    }

    const result = await importApp(auth, spaceResource, appData.app);
    if (result.isErr()) {
      return new Err(new Error(result.error.message));
    }
    return new Ok({
      display: "text",
      value: `Imported`,
    });
  },
});
