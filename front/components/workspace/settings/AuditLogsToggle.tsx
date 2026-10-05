import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import { useAuditLogsToggle } from "@app/hooks/useAuditLogsToggle";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import { LayerSingle, SliderToggle } from "@dust-tt/sparkle";

export const AUDIT_LOGS_EMIT_LABEL = "Audit logs";

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
    <GovernanceSettingSection
      sectionId={ADMIN_SECTION_IDS.governance.audit}
      label="Audit"
      icon={LayerSingle}
    >
      <GovernanceSettingRowLayout
        label={AUDIT_LOGS_EMIT_LABEL}
        description="Whether audit events are emitted to WorkOS and the audit logs section is shown in Security"
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
