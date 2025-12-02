import { createPlugin } from "@app/lib/api/poke/types";
import { Err, Ok } from "@app/types";

export const pauseTriggerPlugin = createPlugin({
  manifest: {
    id: "pause-trigger",
    name: "Pause Trigger",
    description: "Pause a trigger to stop its executions",
    resourceTypes: ["triggers"],
    args: {},
  },
  execute: async (auth, resource) => {
    if (!resource) {
      return new Err(new Error("Trigger not found"));
    }

    const result = await resource.disable(auth);
    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok({
      display: "text",
      value: `Trigger "${resource.name}" has been paused successfully.`,
    });
  },
  isApplicableTo: (auth, resource) => !!resource?.enabled,
});

export const unpauseTriggerPlugin = createPlugin({
  manifest: {
    id: "unpause-trigger",
    name: "Unpause Trigger",
    description: "Unpause a trigger to resume its executions",
    resourceTypes: ["triggers"],
    args: {},
  },
  execute: async (auth, resource) => {
    if (!resource) {
      return new Err(new Error("Trigger not found"));
    }

    const result = await resource.enable(auth);
    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok({
      display: "text",
      value: `Trigger "${resource.name}" has been unpaused successfully.`,
    });
  },
  isApplicableTo: (auth, resource) => !!resource && !resource.enabled,
});
