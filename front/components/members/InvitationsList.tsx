import { Avatar, ChevronRightIcon, Chip, Icon, Page } from "@dust-tt/sparkle";
import type { MembershipInvitationType, WorkspaceType } from "@dust-tt/types";
import { useState } from "react";

import { EditInvitationModal } from "@app/components/members/InvitationModal";
import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import { useWorkspaceInvitations } from "@app/lib/swr/memberships";

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
  const filteredInvitations = invitations
    .sort((a, b) => a.inviteEmail.localeCompare(b.inviteEmail))
    .filter((i) => i.status === "pending")
    .filter(
      (i) =>
        !searchText ||
        i.inviteEmail.toLowerCase().includes(searchText.toLowerCase())
    );
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
      <div className="s-w-full">
        {!isInvitationsLoading &&
          filteredInvitations.length > 0 &&
          filteredInvitations.map((invitation: MembershipInvitationType) => (
            <div
              key={`invitation-${invitation.id}`}
              className="transition-color flex cursor-pointer items-center justify-center gap-3 border-t border-structure-200 p-2 text-xs duration-200 hover:bg-action-50 sm:text-sm"
              onClick={() => setSelectedInvite(invitation)}
            >
              <div className="hidden sm:block">
                <Avatar size="sm" className={invitation.sId} />
              </div>
              <div className="flex grow flex-col gap-1 sm:flex-row sm:gap-3">
                <div className="grow font-normal text-element-700">
                  {invitation.inviteEmail}
                </div>
                <div>
                  <Chip
                    size="xs"
                    color={ROLES_DATA[invitation.initialRole]["color"]}
                    className="capitalize"
                  >
                    {displayRole(invitation.initialRole)}
                  </Chip>
                </div>
                <div className="hidden sm:block">
                  <Icon
                    visual={ChevronRightIcon}
                    className="text-element-600"
                  />
                </div>
              </div>
            </div>
          ))}
        {isInvitationsLoading && (
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
        )}
      </div>
    </>
  );
}
