import {
  Avatar,
  ChevronRightIcon,
  Chip,
  DataTable,
  Icon,
  Page,
} from "@dust-tt/sparkle";
import type { MembershipInvitationType, WorkspaceType } from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import React, { useMemo, useState } from "react";

import { EditInvitationModal } from "@app/components/members/EditInvitationModal";
import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import { useWorkspaceInvitations } from "@app/lib/swr/memberships";

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
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <span>{info.row.original.inviteEmail}</span>
        </DataTable.CellContent>
      ),
      meta: {
        width: "46rem",
      },
    },
    {
      id: "initialRole",
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
        width: "6rem",
      },
    },
    {
      id: "action",
      cell: () => (
        <DataTable.CellContent>
          <Icon visual={ChevronRightIcon} className="text-element-600" />
        </DataTable.CellContent>
      ),
    },
  ];

  return (
    <>
      {selectedInvite && (
        <EditInvitationModal
          invitation={selectedInvite}
          owner={owner}
          onClose={() => setSelectedInvite(null)}
        />
      )}
      {filteredInvitations.length > 0 && (
        <Page.H variant="h5">Invitations</Page.H>
      )}

      {isInvitationsLoading ? (
        <div className="flex flex-col gap-2">
          <div className="flex animate-pulse cursor-pointer items-center justify-center gap-3 border-t border-structure-200 bg-structure-50 py-2 text-xs sm:text-sm">
            <div className="hidden sm:block">
              <Avatar size="xs" />
            </div>
            <div className="flex grow flex-col gap-1 sm:flex-row sm:gap-3">
              <div className="font-medium text-element-900">Loading...</div>
              <div className="grow font-normal text-element-700"></div>
            </div>
            <div>
              <Chip size="xs" color="slate">
                Loading...
              </Chip>
            </div>
            <div className="hidden sm:block">
              <ChevronRightIcon />
            </div>
          </div>
        </div>
      ) : (
        filteredInvitations.length > 0 && (
          <DataTable data={rows} columns={columns} />
        )
      )}
    </>
  );
}
