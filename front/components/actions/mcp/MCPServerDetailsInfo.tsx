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
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
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

  if (!mcpServerView) {
    return null;
  }

  if (readOnly) {
    const tools = mcpServerView.server.tools ?? [];
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
