import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { InvitationsList } from "@app/components/members/InvitationsList";
import { InviteEmailButtonWithModal } from "@app/components/members/InviteEmailButtonWithModal";
import {
  isFullUserType,
  type SearchMemberWithWorkspaceType,
} from "@app/components/members/MemberSelectionTable";
import { MembersList } from "@app/components/members/MembersList";
import { ChangeMemberModal } from "@app/components/workspace/ChangeMemberModal";
import { isFreePlan, isUpgraded } from "@app/lib/plans/plan_codes";
import { useSearchMembers } from "@app/lib/swr/memberships";
import type {
  SubscriptionPerSeatPricing,
  SubscriptionType,
} from "@app/types/plan";
import type {
  UserType,
  UserTypeWithWorkspace,
  WorkspaceType,
} from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  ButtonsSwitch,
  ButtonsSwitchList,
  SearchInput,
} from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import { useCallback, useState } from "react";

const DEFAULT_PAGE_SIZE = 25;

interface WorkspaceMembersSectionProps {
  currentUser: UserType | null;
  isProvisioningEnabled: boolean;
  isManualInvitationsEnabled: boolean;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  perSeatPricing: SubscriptionPerSeatPricing | null;
  hasAvailableSeats: boolean;
}

export function WorkspaceMembersSection({
  currentUser,
  isProvisioningEnabled,
  isManualInvitationsEnabled,
  owner,
  subscription,
  perSeatPricing,
  hasAvailableSeats,
}: WorkspaceMembersSectionProps) {
  const [view, setView] = useState("members");
  const [searchTerm, setSearchTerm] = useState("");
  const [inviteBlockedPopupReason, setInviteBlockedPopupReason] =
    useState<WorkspaceLimit | null>(null);

  const plan = subscription.plan;

  const onInviteClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!isUpgraded(plan)) {
        setInviteBlockedPopupReason("cant_invite_free_plan");
        event.preventDefault();
      } else if (subscription.paymentFailingSince) {
        setInviteBlockedPopupReason("cant_invite_payment_failure");
        event.preventDefault();
      } else if (!hasAvailableSeats) {
        setInviteBlockedPopupReason("cant_invite_no_seats_available");
        event.preventDefault();
      }
    },
    [plan, subscription.paymentFailingSince, hasAvailableSeats]
  );

  return (
    <>
      <div className="flex flex-row gap-2">
        <SearchInput
          placeholder={
            isProvisioningEnabled ? "Search" : "Search members (email)"
          }
          value={searchTerm}
          name="search"
          onChange={setSearchTerm}
          className="w-full"
        />
        {isManualInvitationsEnabled && (
          <InviteEmailButtonWithModal
            owner={owner}
            prefillText=""
            perSeatPricing={perSeatPricing}
            onInviteClick={onInviteClick}
            isFreePlan={isFreePlan(plan.code)}
          />
        )}
      </div>

      {isManualInvitationsEnabled && (
        <ButtonsSwitchList defaultValue="members" size="xs" className="w-fit">
          <ButtonsSwitch
            value="members"
            label="Members"
            onClick={() => setView("members")}
          />
          <ButtonsSwitch
            value="invitations"
            label="Invitations"
            onClick={() => setView("invitations")}
          />
        </ButtonsSwitchList>
      )}

      {view === "members" && (
        <WorkspaceMembersList
          currentUser={currentUser}
          owner={owner}
          searchTerm={searchTerm}
          isProvisioningEnabled={isProvisioningEnabled}
        />
      )}
      {view === "invitations" && isManualInvitationsEnabled && (
        <InvitationsList owner={owner} searchText={searchTerm} />
      )}

      {inviteBlockedPopupReason && (
        <ReachedLimitPopup
          isAdmin={isAdmin(owner)}
          isOpened={!!inviteBlockedPopupReason}
          onClose={() => setInviteBlockedPopupReason(null)}
          subscription={subscription}
          owner={owner}
          code={inviteBlockedPopupReason}
        />
      )}
    </>
  );
}

interface WorkspaceMembersListProps {
  currentUser: UserType | null;
  owner: WorkspaceType;
  searchTerm: string;
  isProvisioningEnabled: boolean;
}

function WorkspaceMembersList({
  currentUser,
  owner,
  searchTerm,
  isProvisioningEnabled,
}: WorkspaceMembersListProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const [selectedMember, setSelectedMember] =
    useState<UserTypeWithWorkspace | null>(null);

  const membersData = useSearchMembers<UserTypeWithWorkspace>({
    workspaceId: owner.sId,
    searchTerm,
    pageIndex: pagination.pageIndex,
    pageSize: DEFAULT_PAGE_SIZE,
    groupKind: isProvisioningEnabled ? "provisioned" : undefined,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const resetSelectedMember = useCallback(() => {
    setSelectedMember(null);
  }, [setSelectedMember]);

  const handleRowClick = useCallback((user: SearchMemberWithWorkspaceType) => {
    // This page is admin-only so members are always full UserTypeWithWorkspace.
    if (isFullUserType(user)) {
      setSelectedMember(user);
    }
  }, []);

  return (
    <>
      <MembersList
        currentUser={currentUser}
        membersData={membersData}
        onRowClick={handleRowClick}
        showColumns={
          isProvisioningEnabled
            ? ["name", "email", "role", "status", "groups"]
            : ["name", "email", "role"]
        }
        pagination={pagination}
        setPagination={setPagination}
      />
      <ChangeMemberModal
        onClose={resetSelectedMember}
        member={selectedMember}
        mutateMembers={membersData.mutateRegardlessOfQueryParams}
        workspace={owner}
      />
    </>
  );
}
