import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import type { AuditLogsPortal } from "@app/lib/api/audit/workos_audit";
import { useOpenAuditLogsPortal } from "@app/lib/swr/workos";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, File04, Page } from "@dust-tt/sparkle";
import { useState } from "react";

import { WorkspaceSection } from "./WorkspaceSection";

export const AUDIT_LOGS_SECTION_TITLE = "Audit Logs";
export const AUDIT_LOGS_VIEW_LABEL = "View Logs";
export const AUDIT_LOGS_CONFIGURE_EXPORT_LABEL = "Configure Export";

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
    <WorkspaceSection
      title={AUDIT_LOGS_SECTION_TITLE}
      icon={File04}
      sectionId={ADMIN_SECTION_IDS.identity.auditLogs}
    >
      <div className="flex w-full flex-row items-center gap-2">
        <div className="flex-1">
          <Page.P variant="secondary">
            View workspace activity logs or configure export to your security
            information and event management (SIEM) system.
          </Page.P>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            label={AUDIT_LOGS_VIEW_LABEL}
            size="sm"
            variant="outline"
            disabled={loadingPortal !== null}
            onClick={() => void handleClick("view_logs")}
          />
          <Button
            label={AUDIT_LOGS_CONFIGURE_EXPORT_LABEL}
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
