import { createPlugin } from "@app/lib/api/poke/types";
import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { Err, Ok } from "@app/types";
import type { TriggerExecutionMode } from "@app/types/assistant/triggers";

export const webhookSettingsPlugin = createPlugin({
  manifest: {
    id: "webhook-settings",
    name: "Update Webhook Settings",
    description:
      "Update execution per day limit and execution mode for webhook triggers",
    resourceTypes: ["triggers"],
    args: {
      executionPerDayLimitOverride: {
        type: "number",
        label: "Execution Per Day Limit",
        description:
          "Maximum number of executions per day for this webhook trigger",
        async: true,
      },
      executionMode: {
        type: "enum",
        label: "Execution Mode",
        description: "Execution mode for the webhook trigger",
        values: [],
        async: true,
        multiple: false,
      },
    },
  },
  populateAsyncArgs: async (auth, resource) => {
    if (!resource) {
      return new Err(new Error("Trigger not found"));
    }

    const executionModes: {
      label: string;
      value: string;
      checked?: boolean;
    }[] = [
      {
        label: "Fair Use",
        value: "fair_use",
        checked: resource.executionMode === "fair_use",
      },
      {
        label: "Programmatic",
        value: "programmatic",
        checked: resource.executionMode === "programmatic",
      },
    ];

    return new Ok({
      executionPerDayLimitOverride: resource.executionPerDayLimitOverride ?? 0,
      executionMode: executionModes,
    });
  },
  execute: async (auth, resource, args) => {
    if (!resource) {
      return new Err(new Error("Trigger not found"));
    }

    const executionPerDayLimitOverride = args.executionPerDayLimitOverride;
    const executionMode = args.executionMode[0] as
      | TriggerExecutionMode
      | undefined;

    if (executionPerDayLimitOverride < 1) {
      return new Err(
        new Error("Execution per day limit must be greater than 0")
      );
    }

    if (
      executionMode &&
      executionMode !== "fair_use" &&
      executionMode !== "programmatic"
    ) {
      return new Err(
        new Error('Execution mode must be "fair_use" or "programmatic"')
      );
    }

    const workspace = auth.getNonNullableWorkspace();

    // Update the trigger in the database
    await TriggerModel.update(
      {
        executionPerDayLimitOverride: executionPerDayLimitOverride,
        executionMode: executionMode ?? null,
      },
      {
        where: {
          workspaceId: workspace.id,
          id: resource.id,
        },
      }
    );

    const limitText = `${executionPerDayLimitOverride} per day`;
    const modeText = executionMode ?? "not set";

    return new Ok({
      display: "text",
      value: `Webhook trigger settings updated successfully:\n- Execution limit: ${limitText}\n- Execution mode: ${modeText}`,
    });
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    return resource.kind === "webhook";
  },
});
