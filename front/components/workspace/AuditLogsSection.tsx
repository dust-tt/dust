import type { AuditLogsPortal } from "@app/lib/api/audit/workos_audit";
import { useOpenAuditLogsPortal } from "@app/lib/swr/workos";
import type { LightWorkspaceType } from "@app/types/user";
import { File04, NewButton, Page } from "@dust-tt/sparkle";
import { useState } from "react";

import { WorkspaceSection } from "./WorkspaceSection";

interface AuditLogsSectionProps {
  owner: LightWorkspaceType;
}

export function AuditLogsSection({ owner }: AuditLogsSectionProps) {
  const { openPortal } = useOpenAuditLogsPortal({ owner });
  const [loadingPortal, setLoadingPortal] = useState<AuditLogsPortal | null>(
    null
  );

  const handleClick = async (portal: AuditLogsPortal) => {
    setLoadingPortal(portal);
    try {
      await openPortal(portal);
    } finally {
      setLoadingPortal(null);
    }
  };

  return (
    <WorkspaceSection title="Audit Logs" icon={File04}>
      <div className="flex w-full flex-row items-center gap-2">
        <div className="flex-1">
          <Page.P variant="secondary">
            View workspace activity logs or configure export to your security
            information and event management (SIEM) system.
          </Page.P>
        </div>
        <div className="flex justify-end gap-2">
          <NewButton
            label="View Logs"
            size="sm"
            variant="outline"
            disabled={loadingPortal !== null}
            onClick={() => void handleClick("view_logs")}
          />
          <NewButton
            label="Configure Export"
            size="sm"
            variant="outline"
            disabled={loadingPortal !== null}
            onClick={() => void handleClick("configure_export")}
          />
        </div>
      </div>
    </WorkspaceSection>
  );
}
