import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import type { WebhookSourceForAdminType } from "@app/types/triggers/webhooks";
import type { LightWorkspaceType } from "@app/types/user";

export function makeColumnsForWebhookSources(
  owner: LightWorkspaceType
): ColumnDef<WebhookSourceForAdminType>[] {
  return [
    {
      accessorKey: "sId",
      header: "sId",
      cell: ({ row }) => {
        const webhookSource = row.original;
        return (
          <Link
            href={`/poke/${owner.sId}/webhook_sources/${webhookSource.sId}`}
            className="text-action-500 hover:text-action-600"
          >
            {webhookSource.sId}
          </Link>
        );
      },
    },
    {
      accessorKey: "name",
      header: "Name",
    },
    {
      accessorKey: "provider",
      header: "Provider",
      cell: ({ row }) => {
        return row.original.provider ?? "custom";
      },
    },
    {
      accessorKey: "subscribedEvents",
      header: "Subscribed Events",
      cell: ({ row }) => {
        const events = row.original.subscribedEvents;
        if (events.length === 0) {
          return <span className="text-element-600">None</span>;
        }
        return (
          <span className="text-xs">{events.slice(0, 3).join(", ")}</span>
        );
      },
    },
    {
      accessorKey: "urlSecret",
      header: "URL Secret",
      cell: ({ row }) => {
        return (
          <span className="font-mono text-xs">
            {row.original.urlSecret.substring(0, 12)}...
          </span>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => {
        return new Date(row.original.createdAt).toLocaleString();
      },
    },
  ];
}
