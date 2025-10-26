import {
  ActionIcons,
  SearchInput,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TimeIcon,
  ToolCard,
} from "@dust-tt/sparkle";
import React, { useMemo, useState } from "react";

import {
  InternalActionIcons,
  isCustomResourceIconType,
} from "@app/components/resources/resources_icons";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

interface TriggerSelectionPageProps {
  isOpen: boolean;
  onClose: () => void;
  onScheduleSelect: () => void;
  onWebhookSelect: (webhookSourceView: WebhookSourceViewType) => void;
  webhookSourceViews: WebhookSourceViewType[];
}

export function TriggerSelectionPage({
  isOpen,
  onClose,
  onScheduleSelect,
  onWebhookSelect,
  webhookSourceViews,
}: TriggerSelectionPageProps) {
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
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>Add triggers</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <SearchInput
            placeholder="Search triggers..."
            value={searchTerm}
            onChange={setSearchTerm}
            name="triggerSearch"
            className="mt-4"
          />

          <div className="flex flex-col gap-4 py-2">
            {showSchedule && (
              <>
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
              </>
            )}

            {filteredWebhookSourceViews.length > 0 && (
              <div className="flex flex-col gap-4">
                <span className="text-lg font-semibold">Other triggers</span>
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
          </div>

          {!showSchedule && filteredWebhookSourceViews.length === 0 && (
            <div className="flex h-32 items-center justify-center text-sm">
              No triggers found matching your search
            </div>
          )}
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Close",
            variant: "outline",
            onClick: onClose,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
