import {
  Avatar,
  Button,
  ChevronRightIcon,
  Chip,
  classNames,
  DataTable,
  MovingMailIcon,
  Page,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import React, { useMemo, useState } from "react";

import { EditInvitationModal } from "@app/components/members/EditInvitationModal";
import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import { useSendNotification } from "@app/hooks/useNotification";
import { sendInvitations } from "@app/lib/invitations";
import { useWorkspaceInvitations } from "@app/lib/swr/memberships";
import type { MembershipInvitationType, WorkspaceType } from "@app/types";

import { isInvitationExpired } from "./utils";

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
  const { invitations, isInvitationsLoading } = useWorkspaceInvitations(owner);
  const [selectedInvite, setSelectedInvite] =
    useState<MembershipInvitationType | null>(null);
  const sendNotification = useSendNotification();

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
        const isExpired = isInvitationExpired(info.row.original.createdAt);
        return (
          <DataTable.CellContent>
            <div className="flex items-center gap-2">
              <span>{info.row.original.inviteEmail}</span>
              {isExpired && (
                <>
                  <span className="text-red-500">(expired)</span>
                  <Button
                    size="xs"
                    variant="outline"
                    icon={MovingMailIcon}
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
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <Chip
            size="xs"
            color={ROLES_DATA[info.row.original.initialRole]["color"]}
            className="capitalize"
          >
            {displayRole(info.row.original.initialRole)}
          </Chip>
        </DataTable.CellContent>
      ),
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
          <div className="flex flex-col gap-2">
            <div
              className={classNames(
                "flex animate-pulse cursor-pointer items-center justify-center gap-3 border-t py-2 text-xs sm:text-sm",
                "border-border-dark bg-background dark:border-border-dark-night dark:bg-background-night"
              )}
            >
              <div className="hidden sm:block">
                <Avatar size="xs" />
              </div>
              <div className="copy-base flex grow flex-col gap-1 sm:flex-row sm:gap-3">
                <div className="font-semibold text-foreground dark:text-foreground-night">
                  Loading...
                </div>
                <div className="grow text-muted-foreground dark:text-muted-foreground-night"></div>
              </div>
              <div>
                <Chip size="xs">Loading...</Chip>
              </div>
              <div className="hidden sm:block">
                <ChevronRightIcon />
              </div>
            </div>
          </div>
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
