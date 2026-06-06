import { ImportAppBody } from "@app/lib/api/poke/apps";
import { createPlugin } from "@app/lib/api/poke/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { importApp } from "@app/lib/utils/apps";
import { Err, Ok } from "@app/types/shared/result";
import { readFileSync } from "fs";
import { fromError } from "zod-validation-error";

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
  isApplicableTo: (_auth, space) => !space?.isProject(),
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
    const contentValidation = ImportAppBody.safeParse(appData);

    if (!contentValidation.success) {
      return new Err(
        new Error(
          `Invalid content: ${fromError(contentValidation.error).toString()}`
        )
      );
    }
    const { app } = contentValidation.data;

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
