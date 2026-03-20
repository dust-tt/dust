import { useAuditLogsStatus } from "@app/lib/swr/workos";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, DocumentTextIcon, LoadingBlock, Page } from "@dust-tt/sparkle";

import { WorkspaceSection } from "./WorkspaceSection";

interface AuditLogsSectionProps {
  owner: LightWorkspaceType;
}

export function AuditLogsSection({ owner }: AuditLogsSectionProps) {
  const { viewLogsLink, configureExportLink, isLoading, error } =
    useAuditLogsStatus({ owner });

  return (
    <WorkspaceSection title="Audit Logs" icon={DocumentTextIcon}>
      <div className="flex w-full flex-row items-center gap-2">
        <div className="flex-1">
          <Page.P variant="secondary">
            {error
              ? "Failed to load audit logs configuration. Please try again later."
              : "View workspace activity logs or configure export to your security information and event management (SIEM) system."}
          </Page.P>
        </div>
        <div className="flex justify-end gap-2">
          {isLoading ? (
            <LoadingBlock className="h-8 w-32 rounded-xl" />
          ) : (
            <>
              <Button
                label="View Logs"
                size="sm"
                variant="outline"
                disabled={!viewLogsLink}
                onClick={() => {
                  if (viewLogsLink) {
                    window.open(viewLogsLink, "_blank");
                  }
                }}
              />
              <Button
                label="Configure Export"
                size="sm"
                variant="outline"
                disabled={!configureExportLink}
                onClick={() => {
                  if (configureExportLink) {
                    window.open(configureExportLink, "_blank");
                  }
                }}
              />
            </>
          )}
        </div>
      </div>
    </WorkspaceSection>
  );
}
