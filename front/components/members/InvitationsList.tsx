import { EditInvitationModal } from "@app/components/members/EditInvitationModal";
import {
  displayRole,
  normalizeDisplayRole,
  ROLES_DATA,
} from "@app/components/members/Roles";
import { useSendNotification } from "@app/hooks/useNotification";
import { sendInvitations } from "@app/lib/invitations";
import { useWorkspaceInvitations } from "@app/lib/swr/memberships";
import type { MembershipInvitationType } from "@app/types/membership_invitation";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  Button,
  Chip,
  DataTable,
  DataTableLoadingSkeleton,
  Mail01,
  Page,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import type React from "react";
import { useMemo, useState } from "react";

type RowData = MembershipInvitationType & {
  onClick: () => void;
};

export function InvitationsList({
  owner,
  searchText,
}: {
  owner: WorkspaceType;
  searchText?: string;
}) {
  const { invitations, isInvitationsLoading } = useWorkspaceInvitations(owner, {
    includeExpired: true,
  });
  const [selectedInvite, setSelectedInvite] =
    useState<MembershipInvitationType | null>(null);
  const sendNotification = useSendNotification();

  // Managers cannot resend invitations targeting the admin role (matches the
  // server-side escalation guard); only admins can.
  const canManageAdminRole = isAdmin(owner);

  const filteredInvitations = useMemo(
    () =>
      invitations
        .sort((a, b) => a.inviteEmail.localeCompare(b.inviteEmail))
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

  const columns = [
    {
      id: "inviteEmail",
      header: "Invitation Email",
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
                  <span className="text-red-500">(expired)</span>
                  {canResend && (
                    <Button
                      size="xs"
                      variant="outline"
                      icon={Mail01}
                      label="Resend"
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
      id: "initialRole",
      header: "Role",
      accessorFn: (row: RowData) => row.initialRole,
      cell: (info: CellContext<RowData, string>) => {
        // `builder` is deprecated: display it as a regular member.
        const displayedRole = normalizeDisplayRole(
          info.row.original.initialRole
        );
        return (
          <DataTable.CellContent>
            <Chip
              size="xs"
              color={ROLES_DATA[displayedRole]["color"]}
              className="capitalize"
            >
              {displayRole(displayedRole)}
            </Chip>
          </DataTable.CellContent>
        );
      },
      meta: {
        className: "w-32",
      },
    },
  ];

  return (
    <>
      <EditInvitationModal
        invitation={selectedInvite}
        owner={owner}
        onClose={() => setSelectedInvite(null)}
      />
      <div className="flex flex-col gap-1 pt-2">
        {isInvitationsLoading && (
          <DataTableLoadingSkeleton showSelectionColumn={false} rows={3} />
        )}
        {!isInvitationsLoading && invitations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Page.P variant="secondary">No pending invitations</Page.P>
            <Page.P variant="secondary">
              Send invitations to add new members to your workspace
            </Page.P>
          </div>
        )}
        {!isInvitationsLoading &&
          invitations.length > 0 &&
          (filteredInvitations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Page.P variant="secondary">
                No invitations match your search
              </Page.P>
              <Page.P variant="secondary">
                Try adjusting your search terms
              </Page.P>
            </div>
          ) : (
            <DataTable data={rows} columns={columns} />
          ))}
      </div>
    </>
  );
}
