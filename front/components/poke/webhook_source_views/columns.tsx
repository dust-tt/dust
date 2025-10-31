import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import type { WebhookSourceViewForAdminType } from "@app/types/triggers/webhooks";
import type { LightWorkspaceType } from "@app/types/user";

export function makeColumnsForWebhookSourceViews(
  owner: LightWorkspaceType
): ColumnDef<WebhookSourceViewForAdminType>[] {
  return [
    {
      accessorKey: "sId",
      header: "sId",
      cell: ({ row }) => {
        const view = row.original;
        return (
          <Link
            href={`/poke/${owner.sId}/webhook_source_views/${view.sId}`}
            className="text-action-500 hover:text-action-600"
          >
            {view.sId}
          </Link>
        );
      },
    },
    {
      accessorKey: "customName",
      header: "Name",
    },
    {
      accessorKey: "webhookSource.sId",
      header: "Webhook Source",
      cell: ({ row }) => {
        const view = row.original;
        return (
          <Link
            href={`/poke/${owner.sId}/webhook_sources/${view.webhookSource.sId}`}
            className="text-action-500 hover:text-action-600"
          >
            {view.webhookSource.sId}
          </Link>
        );
      },
    },
    {
      accessorKey: "spaceId",
      header: "Space",
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
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => {
        return new Date(row.original.createdAt).toLocaleString();
      },
    },
  ];
}
