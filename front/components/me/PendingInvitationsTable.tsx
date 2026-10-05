import config from "@app/lib/api/config";
import { compareStrings } from "@app/lib/i18n/format";
import { classNames } from "@app/lib/utils";
import type { PendingInvitationOption } from "@app/types/membership_invitation";
import type { ActiveRoleType } from "@app/types/user";
import { Button, DataTable, Label } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ColumnDef } from "@tanstack/react-table";
import type { MouseEvent } from "react";
import { useMemo } from "react";

const ROLE_LABELS: Record<ActiveRoleType, MessageDescriptor> = {
  admin: msg({ message: "admin", context: "workspace role" }),
  manager: msg({ message: "manager", context: "workspace role" }),
  user: msg({ message: "user", context: "workspace role" }),
};

interface PendingInvitationsTableRow extends PendingInvitationOption {
  onJoin: () => void;
  // Present only to satisfy DataTable's TBaseData constraint, which requires a row
  // to share at least one of its optional props. Joining is button-only.
  onClick?: () => void;
}

interface PendingInvitationsTableProps {
  invitations: PendingInvitationOption[];
}

export function PendingInvitationsTable({
  invitations,
}: PendingInvitationsTableProps) {
  const { t, i18n } = useLingui();
  const sortedInvitations = useMemo(
    () =>
      invitations
        .slice()
        .sort((a, b) => compareStrings(a.workspaceName, b.workspaceName)),
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
            `${config.getApiBaseUrl()}/api/login?inviteToken=${encodeURIComponent(invitation.token)}`
          );
        },
      })),
    [sortedInvitations]
  );

  const columns = useMemo<ColumnDef<PendingInvitationsTableRow>[]>(
    () => [
      {
        accessorKey: "workspaceName",
        header: t`Workspace`,
        sortingFn: (rowA, rowB) =>
          compareStrings(
            rowA.original.workspaceName,
            rowB.original.workspaceName
          ),
        cell: ({ row }) => {
          const role = t(ROLE_LABELS[row.original.initialRole]);
          return (
            <DataTable.CellContent grow>
              <div
                className={classNames(
                  "flex flex-col gap-1 py-3",
                  row.original.isExpired && "opacity-60"
                )}
              >
                <span className="text-sm font-semibold text-foreground">
                  {row.original.workspaceName}
                </span>
                <span className="text-xs text-muted-foreground">
                  <Trans>Role: {role}</Trans>
                </span>
              </div>
            </DataTable.CellContent>
          );
        },
        meta: {
          className: "w-full",
        },
      },
      {
        id: "createdAt",
        header: t`Invited`,
        sortingFn: (rowA, rowB) =>
          rowA.original.createdAt - rowB.original.createdAt,
        cell: ({ row }) => (
          <DataTable.CellContent>
            <span className="text-sm text-muted-foreground">
              {new Date(row.original.createdAt).toLocaleString(i18n.locale)}
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
              label={row.original.isExpired ? t`Expired` : t`Join`}
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
    [t, i18n]
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
        <Label>
          <Trans>No pending invitations found.</Trans>
        </Label>
      )}
    </div>
  );
}
