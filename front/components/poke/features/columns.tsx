import { IconButton, SliderToggle } from "@dust-tt/sparkle";
import type { WhitelistableFeature, WorkspaceType } from "@dust-tt/types";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import type { NotificationType } from "@app/components/sparkle/Notification";

type FeatureFlagsDisplayType = {
  name: WhitelistableFeature;
  enabled: boolean;
};

export function makeColumnsForFeatureFlags(
  owner: WorkspaceType,
  reload: () => void,
  sendNotification: (n: NotificationType) => void
): ColumnDef<FeatureFlagsDisplayType>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Name</p>
            <IconButton
              variant="tertiary"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      id: "enabled",
      cell: ({ row }) => {
        const { name, enabled } = row.original;

        return (
          <SliderToggle
            size="xs"
            selected={enabled}
            onClick={async () =>
              toggleFeatureFlag(owner, name, enabled, reload, sendNotification)
            }
          />
        );
      },
    },
  ];
}

async function toggleFeatureFlag(
  owner: WorkspaceType,
  feature: WhitelistableFeature,
  enabled: boolean,
  reload: () => void,
  sendNotification: (n: NotificationType) => void
) {
  try {
    const r = await fetch(`/api/poke/workspaces/${owner.sId}/features`, {
      method: enabled ? "DELETE" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: feature,
      }),
    });
    if (!r.ok) {
      throw new Error("Failed to disable feature.");
    }

    reload();
  } catch (e) {
    sendNotification({
      title: "Error",
      description: `An error occurred while toggling feature "${feature}": ${JSON.stringify(
        e,
        null,
        2
      )}`,
      type: "error",
    });
  }
}
