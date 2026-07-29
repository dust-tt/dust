import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import { useAuditLogsToggle } from "@app/hooks/useAuditLogsToggle";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import { LayerSingle, SliderToggle } from "@dust-tt/sparkle";

interface AuditLogsToggleProps {
  owner: WorkspaceType;
}

export function AuditLogsGovernanceSection({ owner }: AuditLogsToggleProps) {
  const { subscription } = useAuth();
  const { isEnabled, isChanging, doToggleAuditLogs } = useAuditLogsToggle({
    owner,
  });
  const { hasFeature } = useFeatureFlags();

  const hasAuditLogsAccess =
    subscription.plan.isAuditLogsAllowed || hasFeature("audit_logs");

  if (!hasAuditLogsAccess) {
    return null;
  }

  return (
    <GovernanceSettingSection label="Audit" icon={LayerSingle}>
      <GovernanceSettingRowLayout
        label="Audit logs"
        description="Whether audit events are emitted to WorkOS and the audit logs section is shown in IT & Security."
        action={
          <SliderToggle
            selected={isEnabled}
            disabled={isChanging}
            onClick={doToggleAuditLogs}
          />
        }
      />
    </GovernanceSettingSection>
  );
}
