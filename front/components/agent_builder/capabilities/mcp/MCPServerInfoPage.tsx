import { Chip, ContentMessage } from "@dust-tt/sparkle";
import React from "react";

import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { pluralize } from "@app/types";

interface MCPServerInfoPageProps {
  infoMCPServerView: MCPServerViewType | null;
  infoAction: AgentBuilderAction | null;
}

function DataVisualizationInfoContent() {
  const tools = [
    {
      name: "Create chart",
      description:
        "Generate charts and graphs from data (bar, line, pie, scatter, etc.)",
    },
    {
      name: "Create interactive visualization",
      description: "Create interactive data visualizations and dashboards",
    },
  ];

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
              label={`${tools.length} tool${pluralize(tools.length)}`}
            />
          </div>

          <div className="flex flex-col gap-4">
            <span className="text-md text-muted-foreground dark:text-muted-foreground-night">
              These tools will be available to your agent during conversations:
            </span>
            <div className="space-y-3">
              {tools.map((tool, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                    {tool.name}
                  </span>
                  <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    {tool.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MCPServerInfoContent({
  infoMCPServerView,
}: {
  infoMCPServerView: MCPServerViewType;
}) {
  const { owner } = useAgentBuilderContext();

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
              label={`${infoMCPServerView.server.tools?.length || 0} tools`}
            />
          </div>

          {infoMCPServerView.server.tools &&
          infoMCPServerView.server.tools.length > 0 ? (
            <div className="flex flex-col gap-4">
              <span className="text-md text-muted-foreground dark:text-muted-foreground-night">
                These tools will be available to your agent during conversations
                and can be configured with different permission levels:
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

export function MCPServerInfoPage({
  infoMCPServerView,
  infoAction,
}: MCPServerInfoPageProps) {
  if (infoMCPServerView) {
    return <MCPServerInfoContent infoMCPServerView={infoMCPServerView} />;
  }

  if (infoAction?.type === "DATA_VISUALIZATION") {
    return <DataVisualizationInfoContent />;
  }

  // This should never happen
  return null;
}
