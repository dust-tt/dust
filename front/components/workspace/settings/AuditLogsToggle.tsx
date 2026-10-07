import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { useAuditLogsToggle } from "@app/hooks/useAuditLogsToggle";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import { SettingsList, SliderToggle } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface AuditLogsToggleProps {
  owner: WorkspaceType;
}

export function AuditLogsGovernanceSection({ owner }: AuditLogsToggleProps) {
  const { t } = useLingui();
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
    <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.governance.audit}>
      <SettingsList>
        <SettingsList.Row
          title={t`Audit logs`}
          description={t`Whether audit events are emitted to WorkOS and the audit logs section is shown in Security`}
          action={
            <SliderToggle
              selected={isEnabled}
              disabled={isChanging}
              onClick={doToggleAuditLogs}
            />
          }
        />
      </SettingsList>
    </AdminSectionAnchor>
  );
}
