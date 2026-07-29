import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import { useAuditLogsToggle } from "@app/hooks/useAuditLogsToggle";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import {
  ContextItem,
  File04,
  LayerSingle,
  SliderToggle,
} from "@dust-tt/sparkle";

interface AuditLogsToggleProps {
  owner: WorkspaceType;
}

export function AuditLogsToggle({ owner }: AuditLogsToggleProps) {
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
    <ContextItem
      title="Audit Logs"
      subElement="Emit audit events to WorkOS and expose the audit logs section in workspace access. Turning this off stops emission and hides the section."
      visual={<File04 className="h-6 w-6" />}
      hasSeparatorIfLast={true}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doToggleAuditLogs}
        />
      }
    />
  );
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
