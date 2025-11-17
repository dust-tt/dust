import { Chip, ContentMessage } from "@dust-tt/sparkle";
import React from "react";

import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { pluralize } from "@app/types";

interface MCPServerInfoPageProps {
  infoMCPServerView: MCPServerViewType;
}

export function MCPServerInfoPage({
  infoMCPServerView,
}: MCPServerInfoPageProps) {
  const { owner } = useAgentBuilderContext();

  const nbTools = (infoMCPServerView.server.tools ?? []).length;

  return (
    <div className="flex h-full flex-col space-y-6 pt-3">
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-foreground dark:text-foreground-night">
              Available Tools
            </h3>
            <Chip
              size="xs"
              color="info"
              label={`${nbTools} tool${pluralize(nbTools)}`}
            />
          </div>

          {nbTools > 0 ? (
            <div className="flex flex-col gap-4">
              <span className="text-md text-muted-foreground dark:text-muted-foreground-night">
                {nbTools > 1 ? "These tools" : "This tool"}&nbsp;will be
                available to your agent during conversations and can be
                configured with different permission levels:
              </span>
              <ToolsList
                owner={owner}
                mcpServerView={infoMCPServerView}
                disableUpdates
              />
            </div>
          ) : (
            <ContentMessage variant="primary" size="sm">
              No tools are currently available for this server.
            </ContentMessage>
          )}
        </div>
      </div>
    </div>
  );
}
