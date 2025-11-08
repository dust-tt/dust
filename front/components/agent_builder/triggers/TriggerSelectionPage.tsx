import { ActionCard, SearchInput, TimeIcon } from "@dust-tt/sparkle";
import React, { useMemo, useState } from "react";

import { getIcon } from "@app/components/resources/resources_icons";
import { normalizeWebhookIcon } from "@app/lib/webhookSource";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

interface TriggerSelectionPageContentProps {
  onScheduleSelect: () => void;
  onWebhookSelect: (webhookSourceView: WebhookSourceViewType) => void;
  webhookSourceViews: WebhookSourceViewType[];
}

export function TriggerSelectionPageContent({
  onScheduleSelect,
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
              icon={TimeIcon}
              label="Schedule"
              description="Trigger this agent on a schedule"
              isSelected={false}
              canAdd
              onClick={onScheduleSelect}
              cardContainerClassName="h-36"
            />
          )}

          {filteredWebhookSourceViews.length > 0 &&
            filteredWebhookSourceViews.map((view) => {
              return (
                <ActionCard
                  key={view.sId}
                  icon={getIcon(normalizeWebhookIcon(view.icon))}
                  label={view.webhookSource.name}
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

      {!showSchedule && filteredWebhookSourceViews.length === 0 && (
        <div className="flex h-32 items-center justify-center text-sm">
          No triggers found matching your search
        </div>
      )}
    </>
  );
}
