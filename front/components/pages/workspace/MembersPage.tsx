import { WorkspaceGroupsList } from "@app/components/groups/WorkspaceGroupsList";
import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { WorkspaceMembersSection } from "@app/components/members/WorkspaceMembersSection";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { isSCIMEnabled } from "@app/lib/plans/scim";
import {
  usePerSeatPricing,
  useWorkspaceSeatAvailability,
  useWorkspaceVerifiedDomains,
} from "@app/lib/swr/workspaces";
import {
  Page,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";

export function MembersPage() {
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

  const isLoading =
    isVerifiedDomainsLoading ||
    isSeatAvailabilityLoading ||
    isPerSeatPricingLoading;

  if (isLoading) {
    return (
      <AdminPageContainer>
        <div className="flex h-full items-center justify-center">
          <Spinner size="lg" />
        </div>
      </AdminPageContainer>
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
    />
  );

  return (
    <AdminPageContainer>
      <div className="mb-4">
        <div className="flex flex-col gap-6">
          <Page.Header
            title="People"
            description="Manage team members and their roles."
          />
          <Tabs
            value={activeTab}
            onValueChange={(value) => tab.setParam(value)}
          >
            <TabsList className="mb-6">
              <TabsTrigger value="members" label="Members" />
              <TabsTrigger value="groups" label="Groups" />
            </TabsList>
            <TabsContent value="members" className="flex flex-col gap-4">
              {membersContent}
            </TabsContent>
            <TabsContent value="groups" className="flex flex-col gap-4">
              <WorkspaceGroupsList owner={owner} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AdminPageContainer>
  );
}
