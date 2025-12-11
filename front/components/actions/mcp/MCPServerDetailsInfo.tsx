import { Separator } from "@dust-tt/sparkle";
import { useMemo } from "react";

import { InternalMCPBearerTokenForm } from "@app/components/actions/mcp/InternalMCPBearerTokenForm";
import { MCPServerSettings } from "@app/components/actions/mcp/MCPServerSettings";
import { MCPServerViewForm } from "@app/components/actions/mcp/MCPServerViewForm";
import { RemoteMCPForm } from "@app/components/actions/mcp/RemoteMCPForm";
import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import {
  isRemoteMCPServerType,
  requiresBearerTokenConfiguration,
} from "@app/lib/actions/mcp_helper";
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

  const requiresBearerToken = requiresBearerTokenConfiguration(
    mcpServerView.server
  );
  return (
    <div className="flex flex-col gap-3">
      {mcpServerView.editedByUser && (
        <div className="flex w-full text-sm text-muted-foreground dark:text-muted-foreground-night">
          Edited by {mcpServerView.editedByUser.fullName}, {editedAt}
        </div>
      )}
      <Separator />
      <MCPServerViewForm mcpServerView={mcpServerView} />
      <Separator />
      {mcpServerView.server.authorization && (
        <MCPServerSettings mcpServerView={mcpServerView} owner={owner} />
      )}
      {isRemoteMCPServerType(mcpServerView.server) ? (
        <RemoteMCPForm mcpServer={mcpServerView.server} owner={owner} />
      ) : requiresBearerToken ? (
        <InternalMCPBearerTokenForm />
      ) : null}
      <div className="mt-2">
        <ToolsList owner={owner} mcpServerView={mcpServerView} />
      </div>
    </div>
  );
}
