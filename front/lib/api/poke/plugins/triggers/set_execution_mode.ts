import { createPlugin } from "@app/lib/api/poke/types";
import type { TriggerExecutionMode } from "@app/types/assistant/triggers";
import { isTriggerExecutionMode } from "@app/types/assistant/triggers";
import { Err, Ok } from "@app/types/shared/result";

const EXECUTION_MODE_LABELS: Record<TriggerExecutionMode, string> = {
  user_pool: "User pool",
  workspace_pool: "Workspace pool",
};

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
        values: [],
        async: true,
        multiple: false,
      },
    },
    requiredRoles: ["support"],
  },
  populateAsyncArgs: async (auth, resource) => {
    if (!resource) {
      return new Err(new Error("Trigger not found"));
    }

    return new Ok({
      executionMode: Object.entries(EXECUTION_MODE_LABELS).map(
        ([value, label]) => ({
          label,
          value,
          checked: resource.executionMode === value,
        })
      ),
    });
  },
  execute: async (auth, resource, args) => {
    if (!resource) {
      return new Err(new Error("Trigger not found"));
    }

    const executionMode = args.executionMode[0];
    if (!executionMode || !isTriggerExecutionMode(executionMode)) {
      return new Err(new Error("Invalid execution mode"));
    }

    const res = await resource.forceSetExecutionMode(auth, executionMode);
    if (res.isErr()) {
      return new Err(res.error);
    }

    return new Ok({
      display: "text",
      value: `Trigger "${resource.name}" is now charged to the ${EXECUTION_MODE_LABELS[executionMode].toLowerCase()}.`,
    });
  },
});
