import { useAuditLogsUiToggle } from "@app/hooks/useAuditLogsUiToggle";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, DocumentTextIcon, SliderToggle } from "@dust-tt/sparkle";

interface AuditLogsUiToggleProps {
  owner: WorkspaceType;
}

export function AuditLogsUiToggle({ owner }: AuditLogsUiToggleProps) {
  const { isEnabled, isChanging, doToggleAuditLogsUi } = useAuditLogsUiToggle({
    owner,
  });

  return (
    <ContextItem
      title="Audit Logs"
      subElement="Show audit logs section in workspace access settings"
      visual={<DocumentTextIcon className="h-6 w-6" />}
      hasSeparatorIfLast={true}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doToggleAuditLogsUi}
        />
      }
    />
  );
}
