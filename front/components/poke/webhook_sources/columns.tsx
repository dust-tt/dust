import { LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { PokeListWebhookSources } from "@app/pages/api/poke/workspaces/[wId]/webhook_sources";
import type { LightWorkspaceType } from "@app/types/user";

type WebhookSourceDisplayType =
  PokeListWebhookSources["webhookSources"][number];

export function makeColumnsForWebhookSources(
  owner: LightWorkspaceType
): ColumnDef<WebhookSourceDisplayType>[] {
  return [
    {
      accessorKey: "sId",
      cell: ({ row }) => {
        const source = row.original;
        return (
          <LinkWrapper
            href={`/poke/${owner.sId}/webhook-sources/${source.sId}`}
          >
            {source.sId}
          </LinkWrapper>
        );
      },
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="sId" />
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Name" />
      ),
    },
    {
      accessorKey: "provider",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Provider" />
      ),
      cell: ({ row }) => row.original.provider ?? "Custom",
    },
    {
      accessorKey: "subscribedEvents",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Events" />
      ),
      cell: ({ row }) => {
        const events = row.original.subscribedEvents;
        if (events.length === 0) {
          return "All";
        }
        return events.join(", ");
      },
    },
    {
      accessorKey: "triggerCount",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Triggers" />
      ),
    },
    {
      accessorKey: "viewCount",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Views" />
      ),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Created at" />
      ),
      cell: ({ row }) => formatTimestampToFriendlyDate(row.original.createdAt),
    },
  ];
}
