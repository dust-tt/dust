import WorkspaceAccessPanel from "@app/components/workspace/WorkspaceAccessPanel";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useWorkspaceVerifiedDomains } from "@app/lib/swr/workspaces";
import { Fingerprint04, Page, Spinner } from "@dust-tt/sparkle";

export function WorkspaceIdentityProvisioningPage() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const plan = subscription.plan;

  const { verifiedDomains, isVerifiedDomainsLoading } =
    useWorkspaceVerifiedDomains({ workspaceId: owner.sId });

  if (isVerifiedDomainsLoading) {
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
          title="Identity and Provisioning"
          icon={Fingerprint04}
          description="Verify your domain, manage team members and their permissions."
        />
        <WorkspaceAccessPanel
          workspaceVerifiedDomains={verifiedDomains}
          owner={owner}
          plan={plan}
        />
      </Page.Vertical>
    </div>
  );
}
