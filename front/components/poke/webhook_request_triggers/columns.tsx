import type { ColumnDef } from "@tanstack/react-table";
import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import type { PokeGetWebhookRequestsResponseBody } from "@app/pages/api/poke/workspaces/[wId]/triggers/[tId]/webhook_requests";

type WebhookRequestTriggerType =
  PokeGetWebhookRequestsResponseBody["requests"][number];

export function makeColumnsForWebhookRequestTriggers(): ColumnDef<WebhookRequestTriggerType>[] {
  return [
    {
      accessorKey: "id",
      header: "Request ID",
    },
    {
      accessorKey: "timestamp",
      header: "Timestamp",
      cell: ({ row }) => {
        return new Date(row.original.timestamp).toLocaleString();
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        const statusColors: Record<string, string> = {
          workflow_start_succeeded: "bg-success-100 text-success-800",
          workflow_start_failed: "bg-red-100 text-red-800",
          not_matched: "bg-element-100 text-element-800",
          rate_limited: "bg-warning-100 text-warning-800",
        };
        const colorClass =
          statusColors[status] || "bg-element-100 text-element-800";

        return (
          <span
            className={`rounded px-2 py-1 text-xs font-medium ${colorClass}`}
          >
            {status}
          </span>
        );
      },
    },
    {
      id: "payload",
      header: "Payload",
      cell: ({ row }) => {
        const [isOpen, setIsOpen] = useState(false);
        const payload = row.original.payload;

        if (!payload) {
          return <span className="text-element-600">No payload</span>;
        }

        return (
          <div>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Are you sure you want to access this sensitive user data? (Access will be logged)"
                  )
                ) {
                  setIsOpen(true);
                }
              }}
              className="text-action-500 hover:text-action-600 text-xs"
            >
              Show Payload
            </button>

            <Sheet open={isOpen} onOpenChange={() => setIsOpen(false)}>
              <SheetContent size="lg">
                <SheetHeader>
                  <SheetTitle>Webhook Request Payload</SheetTitle>
                </SheetHeader>
                <SheetContainer>
                  <div className="flex flex-col gap-4">
                    {payload.headers ? (
                      <div>
                        <div className="text-xs font-medium">Headers</div>
                        <pre className="bg-structure-50 mt-1 max-h-60 overflow-auto rounded p-2 text-xs">
                          {JSON.stringify(payload.headers, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                    {payload.body ? (
                      <div>
                        <div className="text-xs font-medium">Body</div>
                        <pre className="bg-structure-50 mt-1 max-h-96 overflow-auto rounded p-2 text-xs">
                          {JSON.stringify(payload.body, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                </SheetContainer>
                <SheetFooter
                  leftButtonProps={{
                    label: "Close",
                    variant: "outline",
                    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsOpen(false);
                    },
                  }}
                />
              </SheetContent>
            </Sheet>
          </div>
        ) as React.ReactNode;
      },
    },
  ];
}
