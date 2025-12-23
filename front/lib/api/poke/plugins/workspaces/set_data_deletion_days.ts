import { createPlugin } from "@app/lib/api/poke/types";
import { updateWorkspaceMetadata } from "@app/lib/api/workspace";
import { Err, Ok } from "@app/types";

const MIN_DATA_DELETION_DAYS = 30;
const MAX_DATA_DELETION_DAYS = 120;
const DEFAULT_DATA_DELETION_DAYS = 30;

export const setDataDeletionDaysPlugin = createPlugin({
  manifest: {
    id: "set-data-deletion-days",
    name: "Set Data Deletion Days",
    description:
      "Set the number of days before workspace data is deleted after subscription ends. " +
      `Minimum: ${MIN_DATA_DELETION_DAYS} days, Maximum: ${MAX_DATA_DELETION_DAYS} days. ` +
      `Default: ${DEFAULT_DATA_DELETION_DAYS} days if not set.`,
    resourceTypes: ["workspaces"],
    args: {
      dataDeletionDays: {
        type: "number",
        label: "Data Deletion Days",
        description: `Number of days before data deletion (${MIN_DATA_DELETION_DAYS}-${MAX_DATA_DELETION_DAYS})`,
        async: true,
      },
    },
  },
  populateAsyncArgs: async (auth, resource) => {
    const workspace = auth.getNonNullableWorkspace();
    const metadataValue = workspace.metadata?.dataDeletionDays;
    
    // Ensure the value is a number, defaulting to DEFAULT_DATA_DELETION_DAYS if not set or invalid
    const currentValue =
      typeof metadataValue === "number" ? metadataValue : DEFAULT_DATA_DELETION_DAYS;

    return new Ok({
      dataDeletionDays: currentValue,
    });
  },
  execute: async (auth, _, args) => {
    const dataDeletionDays = args.dataDeletionDays;

    if (
      dataDeletionDays < MIN_DATA_DELETION_DAYS ||
      dataDeletionDays > MAX_DATA_DELETION_DAYS
    ) {
      return new Err(
        new Error(
          `Data deletion days must be between ${MIN_DATA_DELETION_DAYS} and ${MAX_DATA_DELETION_DAYS} days.`
        )
      );
    }

    const workspace = auth.getNonNullableWorkspace();
    const res = await updateWorkspaceMetadata(workspace, {
      dataDeletionDays,
    });

    if (res.isErr()) {
      return res;
    }

    return new Ok({
      display: "text",
      value: `Data deletion days set to ${dataDeletionDays} days for workspace "${workspace.name}".`,
    });
  },
});

