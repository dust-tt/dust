import { MCPServerViewForm } from "@app/components/actions/mcp/create/MCPServerViewForm";
import { InternalMCPBearerTokenForm } from "@app/components/actions/mcp/InternalMCPBearerTokenForm";
import { MCPServerSettings } from "@app/components/actions/mcp/MCPServerSettings";
import { RemoteMCPForm } from "@app/components/actions/mcp/RemoteMCPForm";
import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import type { SensitivityLabelsController } from "@app/components/shared/labels/types";
import {
  isRemoteMCPServerType,
  requiresBearerTokenConfiguration,
} from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useMCPServer } from "@app/lib/swr/mcp_servers";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  LoadingBlock,
  Separator,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

type MCPServerDetailsInfoProps = {
  mcpServerView: MCPServerViewType | null;
  owner: LightWorkspaceType;
  readOnly?: boolean;
  sensitivityLabelsController?: SensitivityLabelsController;
};

export function MCPServerDetailsInfo({
  mcpServerView,
  owner,
  readOnly = false,
  sensitivityLabelsController,
}: MCPServerDetailsInfoProps) {
  const editedAt = useMemo(() => {
    const d = new Date(0);
    d.setUTCMilliseconds(mcpServerView?.editedByUser?.editedAt ?? 0);
    return d.toLocaleDateString();
  }, [mcpServerView?.editedByUser]);

  // Views listed by the JIT views endpoint come without their remote server tools, so in
  // read-only mode the tools are fetched on demand (deduped by SWR with the parent's fetch).
  const { server: fetchedServer, isMCPServerLoading } = useMCPServer({
    owner,
    serverId: mcpServerView?.server.sId ?? "",
    disabled: !readOnly || !mcpServerView,
  });

  if (!mcpServerView) {
    return null;
  }

  if (readOnly) {
    if (isMCPServerLoading) {
      return (
        <div className="flex flex-col gap-2">
          <LoadingBlock className="h-6 w-[50%]" />
          <LoadingBlock className="h-4 w-[80%]" />
          <LoadingBlock className="h-4 w-[80%]" />
        </div>
      );
    }

    const tools = fetchedServer?.tools ?? mcpServerView.server.tools ?? [];
    return (
      <div className="flex flex-col gap-2">
        <div className="heading-lg">Available Tools ({tools.length})</div>
        {tools.map((tool, index) => (
          <div key={index} className="flex flex-col gap-1 py-1">
            <div className="heading-base text-foreground">
              {asDisplayName(tool.name)}
            </div>
            {tool.description && (
              <Collapsible>
                <CollapsibleTrigger label="Description" variant="secondary" />
                <CollapsibleContent>
                  <p className="whitespace-pre-wrap break-words pt-1 text-sm text-muted-foreground">
                    {tool.description}
                  </p>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        ))}
        {tools.length === 0 && (
          <p className="text-sm text-muted-foreground">No tools available.</p>
        )}
      </div>
    );
  }

  const requiresBearerToken = requiresBearerTokenConfiguration(
    mcpServerView.server
  );
  return (
    <div className="flex flex-col gap-3">
      {mcpServerView.editedByUser && (
        <div className="flex w-full text-sm text-muted-foreground">
          Edited by {mcpServerView.editedByUser.fullName}, {editedAt}
        </div>
      )}
      <Separator />
      <MCPServerViewForm mcpServerView={mcpServerView} />
      <Separator />
      {mcpServerView.server.authorization && (
        <MCPServerSettings
          mcpServerView={mcpServerView}
          owner={owner}
          sensitivityLabelsController={sensitivityLabelsController}
        />
      )}
      {isRemoteMCPServerType(mcpServerView.server) ? (
        <RemoteMCPForm mcpServer={mcpServerView.server} owner={owner} />
      ) : requiresBearerToken ? (
        <InternalMCPBearerTokenForm serverName={mcpServerView.server.name} />
      ) : null}
      <div className="mt-2">
        <ToolsList owner={owner} mcpServerView={mcpServerView} />
      </div>
    </div>
  );
}
