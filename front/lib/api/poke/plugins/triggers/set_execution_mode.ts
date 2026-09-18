import { createPlugin } from "@app/lib/api/poke/types";
import {
  isTriggerExecutionMode,
  TRIGGER_EXECUTION_MODES,
} from "@app/types/assistant/triggers";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";

export const setTriggerExecutionModePlugin = createPlugin({
  manifest: {
    id: "set-trigger-execution-mode",
    name: "Set Trigger Execution Mode",
    description:
      "Move a trigger between the user pool and the workspace pool, regardless of the workspace plan and permissions",
    resourceTypes: ["triggers"],
    args: {
      executionMode: {
        type: "enum",
        label: "Execution Mode",
        description: "Credit pool the trigger's executions are charged to",
        values: mapToEnumValues(TRIGGER_EXECUTION_MODES, (mode) => ({
          label: mode,
          value: mode,
        })),
        multiple: false,
      },
    },
    requiredRoles: ["support"],
  },
  execute: async (auth, resource, args) => {
    if (!resource) {
      return new Err(new Error("Trigger not found"));
    }

    const executionMode = args.executionMode[0];
    if (!executionMode || !isTriggerExecutionMode(executionMode)) {
      return new Err(new Error("Invalid execution mode"));
    }

    const res = await resource.dangerouslySetExecutionMode(auth, executionMode);
    if (res.isErr()) {
      return new Err(res.error);
    }

    return new Ok({
      display: "text",
      value: `Trigger "${resource.name}" is now charged to the ${executionMode}.`,
    });
  },
});
