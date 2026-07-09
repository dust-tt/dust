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
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { isFreePlan, isUpgraded } from "@app/lib/plans/plan_codes";
import { useSearchMembers } from "@app/lib/swr/memberships";
import {
  usePerSeatPricing,
  useWorkspaceSeatAvailability,
  useWorkspaceVerifiedDomains,
} from "@app/lib/swr/workspaces";
import type {
  UserType,
  UserTypeWithWorkspace,
  WorkspaceType,
} from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  ButtonsSwitch,
  ButtonsSwitchList,
  Page,
  SearchInput,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Users01,
} from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import { useCallback, useEffect, useState } from "react";

const DEFAULT_PAGE_SIZE = 25;

interface WorkspaceMembersSectionProps {
  currentUser: UserType | null;
  isProvisioningEnabled: boolean;
  isManualInvitationsEnabled: boolean;
  owner: WorkspaceType;
  searchTerm: string;
}

function WorkspaceMembersSection({
  currentUser,
  isProvisioningEnabled,
  isManualInvitationsEnabled,
  owner,
  searchTerm,
}: WorkspaceMembersSectionProps) {
  const [view, setView] = useState("members");

  return (
    <>
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
      {view === "invitaitons" && isManualInvitationsEnabled && (
        <InvitationsList owner={owner} searchText={searchTerm} />
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
  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
  }, [setPagination]);

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


export function MembersPage() {
  const { hasFeature } = useFeatureFlags();
  const isAdminGovernanceEnabled = hasFeature("admin_governance");

  const owner = useWorkspace();
  const { subscription, user } = useAuth();
  const plan = subscription.plan;
  const [searchTerm, setSearchTerm] = useState("");
  const [inviteBlockedPopupReason, setInviteBlockedPopupReason] =
    useState<WorkspaceLimit | null>(null);

  const { verifiedDomains, isVerifiedDomainsLoading } =
    useWorkspaceVerifiedDomains({ workspaceId: owner.sId });
  const { hasAvailableSeats, isSeatAvailabilityLoading } =
    useWorkspaceSeatAvailability({ workspaceId: owner.sId });
  const { perSeatPricing, isPerSeatPricingLoading } = usePerSeatPricing({
    workspaceId: owner.sId,
  });

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

  const hasVerifiedDomains = verifiedDomains.length > 0;
  const isProvisioningEnabled =
    plan.limits.users.isSCIMAllowed && hasVerifiedDomains;
  const isManualInvitationsEnabled =
    owner.metadata?.disableManualInvitations !== true;

  const isLoading =
    isVerifiedDomainsLoading ||
    isSeatAvailabilityLoading ||
    isPerSeatPricingLoading;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const members = (
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
      <WorkspaceMembersSection
        currentUser={user}
        owner={owner}
        searchTerm={searchTerm}
        isProvisioningEnabled={isProvisioningEnabled}
        isManualInvitationsEnabled={isManualInvitationsEnabled}
      />
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

  return (
    <div className="mb-4">
      <div className="flex flex-col gap-6">
        <Page.Header
          title="People"
          icon={Users01}
          description="Manage team members and their roles."
        />
        {isAdminGovernanceEnabled ? (
          <Tabs defaultValue="members">
            <TabsList className="mb-6">
              <TabsTrigger value="members" label="Members" />
              <TabsTrigger value="groups" label="Groups" />
            </TabsList>
            <TabsContent value="members" className="flex flex-col gap-4">
              {members}
            </TabsContent>
            <TabsContent value="groups">World</TabsContent>
          </Tabs>
        ) : (
          members
        )}
      </div>
    </div>
  );
}
