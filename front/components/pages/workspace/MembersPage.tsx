import {
  Page,
  SearchInput,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  UserIcon,
} from "@dust-tt/sparkle";
import { UsersIcon } from "@heroicons/react/20/solid";
import type { PaginationState } from "@tanstack/react-table";
import { useCallback, useEffect, useState } from "react";

import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { ReachedLimitPopup } from "@app/components/app/ReachedLimitPopup";
import { InvitationsList } from "@app/components/members/InvitationsList";
import { InviteEmailButtonWithModal } from "@app/components/members/InviteEmailButtonWithModal";
import { MembersList } from "@app/components/members/MembersList";
import { ChangeMemberModal } from "@app/components/workspace/ChangeMemberModal";
import WorkspaceAccessPanel from "@app/components/workspace/WorkspaceAccessPanel";
import { WorkspaceSection } from "@app/components/workspace/WorkspaceSection";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { isUpgraded } from "@app/lib/plans/plan_codes";
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
} from "@app/types";
import { isAdmin } from "@app/types";

const DEFAULT_PAGE_SIZE = 25;

interface WorkspaceMembersGroupsListProps {
  currentUser: UserType | null;
  isProvisioningEnabled: boolean;
  isManualInvitationsEnabled: boolean;
  owner: WorkspaceType;
  searchTerm: string;
}

function WorkspaceMembersGroupsList({
  currentUser,
  isProvisioningEnabled,
  isManualInvitationsEnabled,
  owner,
  searchTerm,
}: WorkspaceMembersGroupsListProps) {
  return (
    <div className="flex flex-col gap-1 pt-2">
      <Tabs defaultValue="members">
        <TabsList className="mb-4">
          <TabsTrigger value="members" label="Members" />
          {isManualInvitationsEnabled && (
            <TabsTrigger value="invitations" label="Invitations" />
          )}
        </TabsList>
        <TabsContent value="members">
          <WorkspaceMembersList
            currentUser={currentUser}
            owner={owner}
            searchTerm={searchTerm}
            isProvisioningEnabled={isProvisioningEnabled}
          />
        </TabsContent>
        {isManualInvitationsEnabled && (
          <TabsContent value="invitations">
            <InvitationsList owner={owner} searchText={searchTerm} />
          </TabsContent>
        )}
      </Tabs>
    </div>
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

  const membersData = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm,
    pageIndex: pagination.pageIndex,
    pageSize: DEFAULT_PAGE_SIZE,
    groupKind: isProvisioningEnabled ? "provisioned" : undefined,
  });

  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
  }, [setPagination]);

  const resetSelectedMember = useCallback(() => {
    setSelectedMember(null);
  }, [setSelectedMember]);

  return (
    <>
      <MembersList
        currentUser={currentUser}
        membersData={membersData}
        onRowClick={setSelectedMember}
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

  const hasVerifiedDomains = verifiedDomains.length > 0;
  const isProvisioningEnabled =
    plan.limits.users.isSCIMAllowed && hasVerifiedDomains;
  const isManualInvitationsEnabled =
    owner.metadata?.disableManualInvitations !== true;

  const isLoading =
    isVerifiedDomainsLoading ||
    isSeatAvailabilityLoading ||
    isPerSeatPricingLoading;

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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mb-4">
      <Page.Vertical gap="lg" align="stretch">
        <Page.Header
          title="People & Security"
          icon={UsersIcon}
          description="Verify your domain, manage team members and their permissions."
        />
        <WorkspaceAccessPanel
          workspaceVerifiedDomains={verifiedDomains}
          owner={owner}
          plan={plan}
        />
        <WorkspaceSection title="Members" icon={UserIcon}>
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
              />
            )}
          </div>
          <WorkspaceMembersGroupsList
            currentUser={user}
            owner={owner}
            searchTerm={searchTerm}
            isProvisioningEnabled={isProvisioningEnabled}
            isManualInvitationsEnabled={isManualInvitationsEnabled}
          />
        </WorkspaceSection>
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
      </Page.Vertical>
    </div>
  );
}
