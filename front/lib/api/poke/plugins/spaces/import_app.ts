import { createPlugin } from "@app/lib/api/poke/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { importApp } from "@app/lib/utils/apps";
import { ImportAppBody } from "@app/pages/api/poke/workspaces/[wId]/apps/import";
import { Err, Ok } from "@app/types/shared/result";
import { isLeft } from "fp-ts/lib/Either";
import { readFileSync } from "fs";
import * as reporter from "io-ts-reporters";

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
    if (!space) {
      return new Err(new Error("Space not found"));
    }
    const spaceResource = await SpaceResource.fetchById(auth, space.sId);
    if (!spaceResource) {
      return new Err(new Error("Space not found"));
    }

    const { file } = args;
    const fileContent = readFileSync(file.filepath, "utf-8");
    const appData = JSON.parse(fileContent);
    const contentValidation = ImportAppBody.decode(appData);

    if (isLeft(contentValidation)) {
      const pathError = reporter.formatValidationErrors(contentValidation.left);

      return new Err(new Error(`Invalid content: ${pathError}`));
    }
    const { app } = contentValidation.right;

    const result = await importApp(auth, spaceResource, app);
    if (result.isErr()) {
      return new Err(new Error(result.error.message));
    }
    return new Ok({
      display: "text",
      value: `Imported`,
    });
  },
});
