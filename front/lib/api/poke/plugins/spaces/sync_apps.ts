import { Err, Ok } from "@dust-tt/types";

import { createPlugin } from "@app/lib/api/poke/types";
import { synchronizeDustApps } from "@app/lib/utils/apps";

export const syncAppsPlugin = createPlugin({
  manifest: {
    id: "sync-apps",
    name: "Sync dust-apps",
    description: "Synchronize dust-apps from production",
    resourceTypes: ["spaces"],
    args: {},
  },
  execute: async (auth, space) => {
    if (!space) {
      return new Err(new Error("No space specified"));
    }

    const result = await synchronizeDustApps(auth, space);
    if (result.isErr()) {
      return new Err(new Error(`Error when syncing: ${result.error.message}`));
    }
    if (!result.value) {
      return new Ok({
        display: "text",
        value: "Sync not enabled.",
      });
    }

    return new Ok({
      display: "json",
      value: result.value,
    });
  },
});
