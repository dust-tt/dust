import { useAuditLogsToggle } from "@app/hooks/useAuditLogsToggle";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, File04, SliderToggle } from "@dust-tt/sparkle";

interface AuditLogsToggleProps {
  owner: WorkspaceType;
}

export function AuditLogsToggle({ owner }: AuditLogsToggleProps) {
  const { isEnabled, isChanging, doToggleAuditLogs } = useAuditLogsToggle({
    owner,
  });

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
