import { WorkspaceMembersSection } from "@app/components/members/WorkspaceMembersSection";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import {
  usePerSeatPricing,
  useWorkspaceSeatAvailability,
  useWorkspaceVerifiedDomains,
} from "@app/lib/swr/workspaces";
import { Page, Spinner, Users01 } from "@dust-tt/sparkle";

export function MembersPage() {
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

  return (
    <div className="mb-4">
      <div className="flex flex-col gap-6">
        <Page.Header
          title="People"
          icon={Users01}
          description="Manage team members and their roles."
        />
        <WorkspaceMembersSection
          currentUser={user}
          owner={owner}
          isProvisioningEnabled={isProvisioningEnabled}
          isManualInvitationsEnabled={isManualInvitationsEnabled}
          subscription={subscription}
          perSeatPricing={perSeatPricing}
          hasAvailableSeats={hasAvailableSeats}
        />
      </div>
    </div>
  );
}
