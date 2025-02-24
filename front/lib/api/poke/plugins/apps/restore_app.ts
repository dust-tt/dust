import { Err, Ok } from "@dust-tt/types";
import assert from "assert";

import { createPlugin } from "@app/lib/api/poke/types";
import { getSpecification } from "@app/lib/api/run";
import { AppResource } from "@app/lib/resources/app_resource";

export const restoreAppPlugin = createPlugin(
  {
    id: "restore-app",
    name: "Restore App",
    description: `Restore an app from the currently selected specification`,
    resourceTypes: ["apps"],
    args: {},
  },
  async (auth, appId) => {
    assert(appId, "appId is required");

    const app = await AppResource.fetchById(auth, appId);
    if (!app) {
      return new Err(new Error("App not found"));
    }

    const searchParams = new URLSearchParams(window.location.search);
    const hash = searchParams.get("hash");
    if (hash) {
      const savedSpecification = await getSpecification(app.toJSON(), hash);
      if (savedSpecification) {
        await app.updateState(auth, {
          savedSpecification: JSON.stringify(savedSpecification),
          savedConfig: "{}",
        });
      }
      return new Ok({
        display: "text",
        value: `App ${app.name} restored successfully`,
      });
    }
    return new Err(new Error("No hash specified"));
  }
);
