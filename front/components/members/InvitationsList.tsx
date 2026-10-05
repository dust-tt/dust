import { EditInvitationModal } from "@app/components/members/EditInvitationModal";
import { ROLE_LABELS, ROLES_DATA } from "@app/components/members/Roles";
import { useSendNotification } from "@app/hooks/useNotification";
import { compareStrings } from "@app/lib/i18n/format";
import { sendInvitations } from "@app/lib/invitations";
import { useWorkspaceInvitations } from "@app/lib/swr/memberships";
import type { MembershipInvitationType } from "@app/types/membership_invitation";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { ActiveRoleType, WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import type { DataTableSkeletonCellProps } from "@dust-tt/sparkle";
import {
  Button,
  Chip,
  ChipCellSkeleton,
  DataTable,
  DataTableSkeleton,
  Mail01,
  Page,
  TextCellSkeleton,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import type React from "react";
import { useMemo, useState } from "react";

type RowData = MembershipInvitationType & {
  onClick: () => void;
};

function InitialRoleCell({ role }: { role: ActiveRoleType }) {
  const { t } = useLingui();
  return (
    <DataTable.CellContent>
      <Chip size="xs" color={ROLES_DATA[role]["color"]}>
        {t(ROLE_LABELS[role])}
      </Chip>
    </DataTable.CellContent>
  );
}

function getColumns({
  owner,
  sendNotification,
  labels,
}: {
  owner: WorkspaceType;
  sendNotification: ReturnType<typeof useSendNotification>;
  labels: { invitationEmail: string; role: string; resend: string };
}) {
  // Managers cannot resend invitations targeting the admin role (matches the
  // server-side escalation guard); only admins can.
  const canManageAdminRole = isAdmin(owner);

  return [
    {
      id: "inviteEmail" as const,
      header: labels.invitationEmail,
      accessorKey: "inviteEmail",
      cell: (info: CellContext<RowData, string>) => {
        const isExpired = info.row.original.isExpired;
        const canResend =
          info.row.original.initialRole !== "admin" || canManageAdminRole;
        return (
          <DataTable.CellContent>
            <div className="flex items-center gap-2">
              <span>{info.row.original.inviteEmail}</span>
              {isExpired && (
                <>
                  <span className="text-red-500">
                    <Trans>(expired)</Trans>
                  </span>
                  {canResend && (
                    <Button
                      size="xs"
                      variant="outline"
                      icon={Mail01}
                      label={labels.resend}
                      onClick={async (e: React.MouseEvent) => {
                        e.stopPropagation();
                        await sendInvitations({
                          owner,
                          emails: [info.row.original.inviteEmail],
                          invitationRole: info.row.original.initialRole,
                          sendNotification,
                          isNewInvitation: false,
                        });
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </DataTable.CellContent>
        );
      },
    },
    {
      id: "initialRole" as const,
      header: labels.role,
      accessorFn: (row: RowData) => row.initialRole,
      cell: (info: CellContext<RowData, string>) => (
        <InitialRoleCell role={info.row.original.initialRole} />
      ),
      meta: {
        className: "w-32",
      },
    },
  ] satisfies ColumnDef<RowData, string>[];
}

type InvitationColumnId = ReturnType<typeof getColumns>[number]["id"];

function InvitationSkeletonCell({
  columnId,
  rowIndex,
}: DataTableSkeletonCellProps<InvitationColumnId>) {
  switch (columnId) {
    case "inviteEmail":
      return (
        <TextCellSkeleton className={["w-48", "w-56", "w-40"][rowIndex % 3]} />
      );
    case "initialRole":
      return <ChipCellSkeleton />;
    default:
      assertNeverAndIgnore(columnId);
      return null;
  }
}

export function InvitationsList({
  owner,
  searchText,
}: {
  owner: WorkspaceType;
  searchText?: string;
}) {
  const { t } = useLingui();
  const { invitations, isInvitationsLoading } = useWorkspaceInvitations(owner, {
    includeExpired: true,
  });
  const [selectedInvite, setSelectedInvite] =
    useState<MembershipInvitationType | null>(null);
  const sendNotification = useSendNotification();

  const filteredInvitations = useMemo(
    () =>
      invitations
        .sort((a, b) => compareStrings(a.inviteEmail, b.inviteEmail))
        .filter((i) => i.status === "pending")
        .filter(
          (i) =>
            !searchText ||
            i.inviteEmail.toLowerCase().includes(searchText.toLowerCase())
        ),
    [invitations, searchText]
  );

  const rows = useMemo(
    () =>
      filteredInvitations.map((invitation) => ({
        ...invitation,
        onClick: () => setSelectedInvite(invitation),
      })),
    [filteredInvitations]
  );

  const columns = getColumns({
    owner,
    sendNotification,
    labels: {
      invitationEmail: t`Invitation Email`,
      role: t`Role`,
      resend: t`Resend`,
    },
  });

  return (
    <>
      <EditInvitationModal
        invitation={selectedInvite}
        owner={owner}
        onClose={() => setSelectedInvite(null)}
      />
      <div className="flex flex-col gap-1 pt-2">
        {isInvitationsLoading && (
          <DataTableSkeleton
            columns={columns}
            SkeletonCell={InvitationSkeletonCell}
            rowCount={3}
          />
        )}
        {!isInvitationsLoading && invitations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Page.P variant="secondary">
              <Trans>No pending invitations</Trans>
            </Page.P>
            <Page.P variant="secondary">
              <Trans>
                Send invitations to add new members to your workspace
              </Trans>
            </Page.P>
          </div>
        )}
        {!isInvitationsLoading &&
          invitations.length > 0 &&
          (filteredInvitations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Page.P variant="secondary">
                <Trans>No invitations match your search</Trans>
              </Page.P>
              <Page.P variant="secondary">
                <Trans>Try adjusting your search terms</Trans>
              </Page.P>
            </div>
          ) : (
            <DataTable data={rows} columns={columns} />
          ))}
      </div>
    </>
  );
}
