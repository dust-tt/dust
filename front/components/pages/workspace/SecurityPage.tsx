import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { AgentRequestedDomainsSetting } from "@app/components/sandbox/AgentRequestedDomainsSetting";
import { ComputerNetworkSection } from "@app/components/sandbox/ComputerNetworkSection";
import { AuditLogsSection } from "@app/components/workspace/AuditLogsSection";
import WorkspaceAccessPanel from "@app/components/workspace/WorkspaceAccessPanel";
import { AuditLogsGovernanceSection } from "@app/components/workspace/settings/AuditLogsToggle";
import { useAdminPageTab } from "@app/hooks/useAdminPageTab";
import { useComputerAdminAccess } from "@app/hooks/useComputerAdminAccess";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { useWorkspaceVerifiedDomains } from "@app/lib/swr/workspaces";
import {
  Page,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";

const SECURITY_TABS = ["identity", "network", "audit"] as const;
type SecurityTab = (typeof SECURITY_TABS)[number];

export function SecurityPage() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const plan = subscription.plan;
  const { hasFeature } = useFeatureFlags();
  const { isComputerEnabled, canAdministrateComputer } =
    useComputerAdminAccess();
  const showAuditLogs =
    (plan.isAuditLogsAllowed || hasFeature("audit_logs")) &&
    owner.metadata?.disableAuditLogs !== true;

  const { verifiedDomains, isVerifiedDomainsLoading } =
    useWorkspaceVerifiedDomains({ workspaceId: owner.sId });

  const { tab, setTab } = useAdminPageTab<SecurityTab>(
    SECURITY_TABS,
    "identity"
  );
  const activeTab: SecurityTab =
    tab === "network" && !isComputerEnabled ? "identity" : tab;

  if (isVerifiedDomainsLoading) {
    return (
      <AdminPageContainer>
        <div className="flex h-full items-center justify-center">
          <Spinner size="lg" />
        </div>
      </AdminPageContainer>
    );
  }

  return (
    <AdminPageContainer>
      <div className="flex flex-col gap-6">
        <Page.Header
          title="Security"
          description="Verify your domain, manage authentication and network access."
        />
        <Tabs
          value={activeTab}
          onValueChange={(value) => setTab(value as SecurityTab)}
        >
          <TabsList className="mb-6">
            <TabsTrigger value="identity" label="Domains & SSO" />
            {isComputerEnabled && (
              <TabsTrigger value="network" label="Network" />
            )}
            <TabsTrigger value="audit" label="Audit Logs" />
          </TabsList>
          <TabsContent value="identity" className="flex flex-col gap-4">
            <WorkspaceAccessPanel
              workspaceVerifiedDomains={verifiedDomains}
              owner={owner}
              plan={plan}
              showAutoJoin={false}
              showProvisioning={false}
              showAuditLogs={false}
            />
          </TabsContent>
          {isComputerEnabled && (
            <TabsContent value="network" className="flex flex-col gap-6">
              <AdminSectionAnchor
                sectionId={ADMIN_SECTION_IDS.computer.agentDomains}
              >
                <AgentRequestedDomainsSetting />
              </AdminSectionAnchor>
              <AdminSectionAnchor
                sectionId={ADMIN_SECTION_IDS.computer.network}
              >
                <ComputerNetworkSection
                  canAdministrateComputer={canAdministrateComputer}
                />
              </AdminSectionAnchor>
            </TabsContent>
          )}
          <TabsContent value="audit" className="flex flex-col gap-4">
            {showAuditLogs && (
              <AdminSectionAnchor
                sectionId={ADMIN_SECTION_IDS.identity.auditLogs}
              >
                <AuditLogsSection owner={owner} />
              </AdminSectionAnchor>
            )}
            <AuditLogsGovernanceSection owner={owner} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminPageContainer>
  );
}
