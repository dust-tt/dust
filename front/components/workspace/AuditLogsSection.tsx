import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import type { AuditLogsPortal } from "@app/lib/api/audit/workos_audit";
import { useOpenAuditLogsPortal } from "@app/lib/swr/workos";
import type { LightWorkspaceType } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";

interface AuditLogsSectionProps {
  owner: LightWorkspaceType;
}

export function AuditLogsSection({ owner }: AuditLogsSectionProps) {
  const { t } = useLingui();
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
    <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.identity.auditLogs}>
      <div className="heading-base text-foreground">
        <Trans>Audit Logs</Trans>
      </div>
      <div className="text-sm text-muted-foreground">
        <Trans>
          View workspace activity logs or configure export to your security
          information and event management (SIEM) system.
        </Trans>
      </div>

      <div className="flex gap-2">
        <Button
          label={t`View Logs`}
          size="sm"
          variant="outline"
          disabled={loadingPortal !== null}
          onClick={() => void handleClick("view_logs")}
        />
        <Button
          label={t`Configure Export`}
          size="sm"
          variant="outline"
          disabled={loadingPortal !== null}
          onClick={() => void handleClick("configure_export")}
        />
      </div>
    </AdminSectionAnchor>
  );
}
