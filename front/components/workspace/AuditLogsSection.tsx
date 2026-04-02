import { useOpenAuditLogsPortal } from "@app/lib/swr/workos";
import type { AuditLogsPortal } from "@app/pages/api/w/[wId]/audit-logs";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, DocumentTextIcon, Page } from "@dust-tt/sparkle";
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
    <WorkspaceSection title="Audit Logs" icon={DocumentTextIcon}>
      <div className="flex w-full flex-row items-center gap-2">
        <div className="flex-1">
          <Page.P variant="secondary">
            View workspace activity logs or configure export to your security
            information and event management (SIEM) system.
          </Page.P>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            label="View Logs"
            size="sm"
            variant="outline"
            disabled={loadingPortal !== null}
            onClick={() => void handleClick("view_logs")}
          />
          <Button
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
