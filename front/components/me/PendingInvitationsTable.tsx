import { Button, DataTable, Label } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import type { MouseEvent } from "react";
import { useMemo } from "react";

import { classNames } from "@app/lib/utils";
import type { PendingInvitationOption } from "@app/types/membership_invitation";

interface PendingInvitationsTableRow extends PendingInvitationOption {
  isExpired: boolean;
  onJoin: () => void;
  onClick?: () => void;
}

interface PendingInvitationsTableProps {
  invitations: PendingInvitationOption[];
}

export function PendingInvitationsTable({
  invitations,
}: PendingInvitationsTableProps) {
  const sortedInvitations = useMemo(
    () =>
      invitations
        .slice()
        .sort((a, b) => a.workspaceName.localeCompare(b.workspaceName)),
    [invitations]
  );

  const rows = useMemo<PendingInvitationsTableRow[]>(
    () =>
      sortedInvitations.map((invitation) => ({
        ...invitation,
        onJoin: () => {
          if (invitation.isExpired) {
            return;
          }
          window.location.assign(
            `/api/login?inviteToken=${encodeURIComponent(invitation.token)}`
          );
        },
      })),
    [sortedInvitations]
  );

  const columns = useMemo<ColumnDef<PendingInvitationsTableRow>[]>(
    () => [
      {
        accessorKey: "workspaceName",
        header: "Workspace",
        sortingFn: (rowA, rowB) =>
          rowA.original.workspaceName.localeCompare(
            rowB.original.workspaceName
          ),
        cell: ({ row }) => (
          <DataTable.CellContent grow>
            <div
              className={classNames(
                "flex flex-col gap-1 py-3",
                row.original.isExpired && "opacity-60"
              )}
            >
              <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                {row.original.workspaceName}
              </span>
              <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                Role: {row.original.initialRole}
              </span>
            </div>
          </DataTable.CellContent>
        ),
        meta: {
          className: "w-full",
        },
      },
      {
        id: "createdAt",
        header: "Invited",
        sortingFn: (rowA, rowB) =>
          rowA.original.createdAt - rowB.original.createdAt,
        cell: ({ row }) => (
          <DataTable.CellContent>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {new Date(row.original.createdAt).toLocaleString()}
            </span>
          </DataTable.CellContent>
        ),
        meta: {
          className: "w-48",
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <DataTable.CellContent className="w-full justify-end">
            <Button
              size="xs"
              variant={row.original.isExpired ? "outline" : "primary"}
              label={row.original.isExpired ? "Expired" : "Join"}
              disabled={row.original.isExpired}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                row.original.onJoin();
              }}
            />
          </DataTable.CellContent>
        ),
        meta: {
          className: "w-24",
        },
      },
    ],
    []
  );

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 ? (
        <DataTable
          data={rows}
          columns={columns}
          sorting={[{ id: "workspaceName", desc: false }]}
        />
      ) : (
        <Label>No pending invitations found.</Label>
      )}
    </div>
  );
}
