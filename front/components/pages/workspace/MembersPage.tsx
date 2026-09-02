import { WorkspaceGroupsList } from "@app/components/groups/WorkspaceGroupsList";
import { WorkspaceMembersSection } from "@app/components/members/WorkspaceMembersSection";
import { useQueryParams } from "@app/hooks/useQueryParams";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { isSCIMEnabled } from "@app/lib/plans/scim";
import { isUsagePageEnabled } from "@app/lib/plans/usage_page";
import {
  usePerSeatPricing,
  useWorkspaceSeatAvailability,
  useWorkspaceVerifiedDomains,
} from "@app/lib/swr/workspaces";
import { isAdmin } from "@app/types/user";
import {
  Page,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";

export function MembersPage() {
  const { featureFlags } = useFeatureFlags();
  const owner = useWorkspace();
  const { subscription, user } = useAuth();
  const plan = subscription.plan;

  const { tab } = useQueryParams(["tab"]);
  const activeTab = tab.value === "groups" ? "groups" : "members";

  const { verifiedDomains, isVerifiedDomainsLoading } =
    useWorkspaceVerifiedDomains({ workspaceId: owner.sId });
  const { hasAvailableSeats, isSeatAvailabilityLoading } =
    useWorkspaceSeatAvailability({ workspaceId: owner.sId });
  const { perSeatPricing, isPerSeatPricingLoading } = usePerSeatPricing({
    workspaceId: owner.sId,
  });

  const hasVerifiedDomains = verifiedDomains.length > 0;
  const isProvisioningEnabled = isSCIMEnabled(plan) && hasVerifiedDomains;
  const isManualInvitationsEnabled =
    owner.metadata?.disableManualInvitations !== true;
  // Workspaces with a Usage page manage model tiers there.
  const showModelTiers =
    isAdmin(owner) && !isUsagePageEnabled(plan, featureFlags);

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

  const membersContent = (
    <WorkspaceMembersSection
      currentUser={user}
      owner={owner}
      isProvisioningEnabled={isProvisioningEnabled}
      isManualInvitationsEnabled={isManualInvitationsEnabled}
      subscription={subscription}
      perSeatPricing={perSeatPricing}
      hasAvailableSeats={hasAvailableSeats}
      showModelTiers={showModelTiers}
    />
  );

  return (
    <div className="mb-4">
      <div className="flex flex-col gap-6">
        <Page.Header
          title="People"
          description="Manage team members and their roles."
        />
        <Tabs value={activeTab} onValueChange={(value) => tab.setParam(value)}>
          <TabsList className="mb-6">
            <TabsTrigger value="members" label="Members" />
            <TabsTrigger value="groups" label="Groups" />
          </TabsList>
          <TabsContent value="members" className="flex flex-col gap-4">
            {membersContent}
          </TabsContent>
          <TabsContent value="groups" className="flex flex-col gap-4">
            <WorkspaceGroupsList
              owner={owner}
              showModelTiers={showModelTiers}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
