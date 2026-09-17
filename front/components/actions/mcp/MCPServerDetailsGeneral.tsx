import { MCPServerViewForm } from "@app/components/actions/mcp/create/MCPServerViewForm";
import { getEffectiveToolSettings } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { InternalMCPBearerTokenForm } from "@app/components/actions/mcp/InternalMCPBearerTokenForm";
import { MCPServerSettings } from "@app/components/actions/mcp/MCPServerSettings";
import { RemoteMCPForm } from "@app/components/actions/mcp/RemoteMCPForm";
import type { SensitivityLabelsController } from "@app/components/shared/labels/types";
import {
  isRemoteMCPServerType,
  requiresBearerTokenConfiguration,
} from "@app/lib/actions/mcp_helper";
import {
  MCP_TOOL_STAKE_COLORS,
  MCP_TOOL_STAKE_DESCRIPTIONS,
  MCP_TOOL_STAKE_SHORT_LABELS,
} from "@app/lib/actions/tool_stakes_descriptions";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Separator,
  Tooltip,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

type MCPServerDetailsGeneralProps = {
  mcpServerView: MCPServerViewType | null;
  owner: LightWorkspaceType;
  readOnly?: boolean;
  sensitivityLabelsController?: SensitivityLabelsController;
};

/**
 * Identity and lifecycle for a tool: name, description, then the remote server's
 * settings and credentials when it has any. The operation list lives in its own
 * tab, and reach in Availability.
 */
export function MCPServerDetailsGeneral({
  mcpServerView,
  owner,
  readOnly = false,
  sensitivityLabelsController,
}: MCPServerDetailsGeneralProps) {
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
        {tools.map((tool) => {
          const { permission } = getEffectiveToolSettings(
            mcpServerView,
            tool.name
          );

          return (
            <div key={tool.name} className="flex flex-col gap-1 my-1">
              <div className="flex items-center gap-2">
                <div className="heading-base flex-grow text-foreground">
                  {asDisplayName(tool.name)}
                </div>
                <Tooltip
                  label={MCP_TOOL_STAKE_DESCRIPTIONS[permission]}
                  trigger={
                    <Chip
                      size="xs"
                      color={MCP_TOOL_STAKE_COLORS[permission]}
                      label={MCP_TOOL_STAKE_SHORT_LABELS[permission]}
                    />
                  }
                />
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
          );
        })}
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
    </div>
  );
}
