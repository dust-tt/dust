import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import type { PokeWebhookRequestType } from "@app/pages/api/poke/workspaces/[wId]/webhook_sources/[webhookSourceId]/requests";
import type { LightWorkspaceType } from "@app/types/user";

export function makeColumnsForWebhookRequests(
  owner: LightWorkspaceType
): ColumnDef<PokeWebhookRequestType>[] {
  return [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => {
        const request = row.original;
        return (
          <Link
            href={`/poke/${owner.sId}/webhook_requests/${request.id}`}
            className="text-action-500 hover:text-action-600"
          >
            {request.id}
          </Link>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        const statusColors = {
          received: "bg-warning-100 text-warning-800",
          processed: "bg-success-100 text-success-800",
          failed: "bg-red-100 text-red-800",
        };
        const colorClass =
          statusColors[status as keyof typeof statusColors] ||
          "bg-element-100 text-element-800";

        return (
          <span className={`rounded px-2 py-1 text-xs font-medium ${colorClass}`}>
            {status}
          </span>
        );
      },
    },
    {
      accessorKey: "webhookSourceId",
      header: "Webhook Source ID",
    },
    {
      accessorKey: "processedAt",
      header: "Processed At",
      cell: ({ row }) => {
        const processedAt = row.original.processedAt;
        if (!processedAt) {
          return <span className="text-element-600">Not processed</span>;
        }
        return new Date(processedAt).toLocaleString();
      },
    },
    {
      accessorKey: "errorMessage",
      header: "Error",
      cell: ({ row }) => {
        const error = row.original.errorMessage;
        if (!error) {
          return <span className="text-element-600">-</span>;
        }
        return (
          <span className="max-w-xs truncate text-xs text-red-800" title={error}>
            {error}
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
