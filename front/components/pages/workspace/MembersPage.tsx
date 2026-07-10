import { WorkspaceGroupsList } from "@app/components/groups/WorkspaceGroupsList";
import { WorkspaceMembersSection } from "@app/components/members/WorkspaceMembersSection";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import {
  usePerSeatPricing,
  useWorkspaceSeatAvailability,
  useWorkspaceVerifiedDomains,
} from "@app/lib/swr/workspaces";
import {
  ContentMessage,
  Page,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Users01,
} from "@dust-tt/sparkle";

export function MembersPage() {
  const { hasFeature } = useFeatureFlags();
  const isAdminGovernanceEnabled = hasFeature("admin_governance");

  const owner = useWorkspace();
  const { subscription, user } = useAuth();
  const plan = subscription.plan;

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
    />
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
              {membersContent}
            </TabsContent>
            <TabsContent value="groups" className="flex flex-col gap-4">
              <ContentMessage
                size="md"
              >
                This page is WIP. Do not change unless you know what you are doing.
              </ContentMessage>
              <WorkspaceGroupsList owner={owner} />
            </TabsContent>
          </Tabs>
        ) : (
          membersContent
        )}
      </div>
    </div>
  );
}
