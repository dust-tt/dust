import { Separator } from "@dust-tt/sparkle";
import { useMemo } from "react";

import { MCPServerSettings } from "@app/components/actions/mcp/MCPServerSettings";
import { MCPServerViewForm } from "@app/components/actions/mcp/MCPServerViewForm";
import { RemoteMCPForm } from "@app/components/actions/mcp/RemoteMCPForm";
import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import { isRemoteMCPServerType } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { LightWorkspaceType } from "@app/types";

type MCPServerDetailsInfoProps = {
  mcpServerView: MCPServerViewType | null;
  owner: LightWorkspaceType;
};

export function MCPServerDetailsInfo({
  mcpServerView,
  owner,
}: MCPServerDetailsInfoProps) {
  const editedAt = useMemo(() => {
    const d = new Date(0);
    d.setUTCMilliseconds(mcpServerView?.editedByUser?.editedAt ?? 0);
    return d.toLocaleDateString();
  }, [mcpServerView?.editedByUser]);

  if (!mcpServerView) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {mcpServerView.editedByUser && (
        <div className="flex w-full text-sm text-muted-foreground dark:text-muted-foreground-night">
          Edited by {mcpServerView.editedByUser.fullName}, {editedAt}
        </div>
      )}
      <Separator />
      <MCPServerViewForm mcpServerView={mcpServerView} />
      {mcpServerView.server.authorization && (
        <>
          <Separator />
          <MCPServerSettings mcpServerView={mcpServerView} owner={owner} />
        </>
      )}
      {isRemoteMCPServerType(mcpServerView.server) && (
        <RemoteMCPForm mcpServer={mcpServerView.server} owner={owner} />
      )}

      <Separator className="mb-4 mt-4" />
      <div className="heading-lg">Available Tools</div>

      <ToolsList owner={owner} mcpServerView={mcpServerView} />
    </div>
  );
}
