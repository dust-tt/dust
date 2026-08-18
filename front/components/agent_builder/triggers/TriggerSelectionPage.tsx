import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { isMonitorableMCPServer } from "@app/lib/triggers/monitorable_mcp_servers";
import { normalizeWebhookIcon } from "@app/lib/webhook_source";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { ActionCard, Clock, SearchInput } from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useMemo, useState } from "react";

interface TriggerSelectionPageContentProps {
  onScheduleSelect: () => void;
  onMCPMonitorSelect?: (mcpServerView: MCPServerViewType) => void;
  mcpServerViews?: MCPServerViewType[];
  onWebhookSelect: (webhookSourceView: WebhookSourceViewType) => void;
  webhookSourceViews: WebhookSourceViewType[];
}

export function TriggerSelectionPageContent({
  onScheduleSelect,
  onMCPMonitorSelect,
  mcpServerViews = [],
  onWebhookSelect,
  webhookSourceViews,
}: TriggerSelectionPageContentProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredWebhookSourceViews = useMemo(() => {
    if (!searchTerm.trim()) {
      return webhookSourceViews;
    }

    const term = searchTerm.toLowerCase();
    return webhookSourceViews.filter((view) => {
      return [view.customName, view.description].some((field) =>
        field?.toLowerCase().includes(term)
      );
    });
  }, [searchTerm, webhookSourceViews]);

  const filteredMCPServerViews = useMemo(() => {
    const monitorableMCPServerViews = mcpServerViews.filter(
      isMonitorableMCPServer
    );
    if (!searchTerm.trim()) {
      return monitorableMCPServerViews;
    }

    const term = searchTerm.toLowerCase();
    return monitorableMCPServerViews.filter((view) =>
      [
        view.name,
        view.description,
        view.server.name,
        view.server.description,
        ...view.server.tools.map((tool) => tool.name),
      ].some((field) => field?.toLowerCase().includes(term))
    );
  }, [mcpServerViews, searchTerm]);

  // Adding a few useful shortcut keywords for schedules.
  const showSchedule = useMemo(() => {
    if (!searchTerm.trim()) {
      return true;
    }

    const term = searchTerm.toLowerCase();
    return (
      "schedule".includes(term) ||
      "time".includes(term) ||
      "cron".includes(term)
    );
  }, [searchTerm]);

  return (
    <>
      <SearchInput
        placeholder="Search triggers..."
        value={searchTerm}
        onChange={setSearchTerm}
        name="triggerSearch"
        className="mt-4"
      />

      <div className="flex flex-col gap-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          {showSchedule && (
            <ActionCard
              icon={Clock}
              label="Schedule"
              description="Trigger this agent on a schedule"
              isSelected={false}
              canAdd
              onClick={onScheduleSelect}
              cardContainerClassName="h-36"
            />
          )}
          {onMCPMonitorSelect &&
            filteredMCPServerViews.map((view) => (
              <ActionCard
                key={view.sId}
                icon={getIcon(view.server.icon)}
                label={`${getMcpServerViewDisplayName(view)} monitor`}
                description="Run this agent when a tool result changes."
                isSelected={false}
                canAdd
                onClick={() => onMCPMonitorSelect(view)}
                cardContainerClassName="h-36"
              />
            ))}

          {filteredWebhookSourceViews.length > 0 &&
            filteredWebhookSourceViews.map((view) => {
              return (
                <ActionCard
                  key={view.sId}
                  icon={getIcon(normalizeWebhookIcon(view.icon))}
                  label={view.customName}
                  description={
                    view.description ||
                    `Trigger this agent with ${view.customName}.`
                  }
                  isSelected={false}
                  canAdd
                  onClick={() => onWebhookSelect(view)}
                  cardContainerClassName="h-36"
                />
              );
            })}
        </div>
      </div>

      {!showSchedule &&
        filteredMCPServerViews.length === 0 &&
        filteredWebhookSourceViews.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm">
            No triggers found matching your search
          </div>
        )}
    </>
  );
}
