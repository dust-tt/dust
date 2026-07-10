import { useAuditLogsToggle } from "@app/hooks/useAuditLogsToggle";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, File04, Page, SliderToggle } from "@dust-tt/sparkle";

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

  if (hasFeature("admin_governance")) {
    return (
      <div className="flex w-full items-center gap-4 p-4 justify-between">
        <Page.Vertical gap="xs" sizing="grow">
          <Page.H variant="h6">Audit logs</Page.H>
          <Page.P variant="secondary" size="sm">
            Emit audit events to WorkOS and expose the audit logs section in IT
            & Security.
          </Page.P>
        </Page.Vertical>
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doToggleAuditLogs}
        />
      </div>
    );
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
