import { ActionIcons, Page, TimeIcon, ToolCard } from "@dust-tt/sparkle";
import React, { useMemo } from "react";

import {
  InternalActionIcons,
  isCustomResourceIconType,
} from "@app/components/resources/resources_icons";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

interface TriggerSelectionContentProps {
  onScheduleSelect: () => void;
  onWebhookSelect: (webhookSourceView: WebhookSourceViewType) => void;
  webhookSourceViews: WebhookSourceViewType[];
  searchTerm: string;
}

export function TriggerSelectionContent({
  onScheduleSelect,
  onWebhookSelect,
  webhookSourceViews,
  searchTerm,
}: TriggerSelectionContentProps) {
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
    <Page.Vertical sizing="grow">
      <div className="flex flex-col gap-4 px-6 py-4">
        {showSchedule && (
          <div className="flex flex-col gap-3">
            <span className="text-lg font-semibold">Top triggers</span>
            <div className="grid grid-cols-2 gap-3">
              <ToolCard
                icon={TimeIcon}
                label="Schedule"
                description="Trigger this agent on a schedule"
                isSelected={false}
                canAdd={true}
                onClick={onScheduleSelect}
                cardContainerClassName="h-36"
              />
            </div>
          </div>
        )}

        {filteredWebhookSourceViews.length > 0 && (
          <div className="flex flex-col gap-3">
            <span className="text-lg font-semibold">Webhooks</span>
            <div className="grid grid-cols-2 gap-3">
              {filteredWebhookSourceViews.map((view) => {
                const icon = isCustomResourceIconType(view.icon)
                  ? ActionIcons[view.icon]
                  : InternalActionIcons[view.icon];

                return (
                  <ToolCard
                    key={view.sId}
                    icon={icon}
                    label={view.customName}
                    description={view.description}
                    isSelected={false}
                    canAdd={true}
                    onClick={() => onWebhookSelect(view)}
                    cardContainerClassName="h-36"
                  />
                );
              })}
            </div>
          </div>
        )}

        {!showSchedule && filteredWebhookSourceViews.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm">
            No triggers found. Try a different search term.
          </div>
        )}
      </div>
    </Page.Vertical>
  );
}
