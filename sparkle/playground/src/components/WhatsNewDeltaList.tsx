import { Checkbox, Icon, TypingAnimation, cn } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

type SummaryCategory = "needAttention" | "keyDecisions";
type SummaryItemDiffState = "unchanged" | "modified" | "added" | "removed";

interface ChecklistItem {
  id: string;
  text: string;
}

interface WhatsNewDeltaListProps {
  label: string;
  summaryCategory: SummaryCategory;
  icon: React.ComponentProps<typeof Icon>["visual"];
  iconClassName: string;
  items: ChecklistItem[];
  checkedSummaryItems: Record<string, boolean>;
  summaryRelatedConversations: Record<string, string[]>;
  summaryItemDiffByKey: Record<string, SummaryItemDiffState>;
  typingItemKeys: Set<string>;
  enteringItemKeys: Set<string>;
  exitingItemKeys: Set<string>;
  typingVersion: number;
  getSummaryItemKey: (category: SummaryCategory, item: ChecklistItem) => string;
  renderSummaryItemText: (text: string) => ReactNode;
  onCheckItem: (itemKey: string, checked: boolean) => void;
  onCheckSection: (itemKeys: string[]) => void;
  onConversationClick: (conversationId: string) => void;
  conversationTitleById: Map<string, string>;
  autoCheckRationaleByKey: Record<string, string>;
}

export function WhatsNewDeltaList({
  label,
  summaryCategory,
  icon,
  iconClassName,
  items,
  checkedSummaryItems,
  summaryRelatedConversations,
  summaryItemDiffByKey,
  typingItemKeys,
  enteringItemKeys,
  exitingItemKeys,
  typingVersion,
  getSummaryItemKey,
  renderSummaryItemText,
  onCheckItem,
  onCheckSection,
  onConversationClick,
  conversationTitleById,
  autoCheckRationaleByKey,
}: WhatsNewDeltaListProps) {
  const sectionItemKeys = items.map((item) =>
    getSummaryItemKey(summaryCategory, item)
  );
  const areAllSectionItemsChecked =
    sectionItemKeys.length > 0 &&
    sectionItemKeys.every((itemKey) => checkedSummaryItems[itemKey]);

  return (
    <div className="flex flex-col gap-2">
      <div className="group/summary-title flex items-center gap-3 pt-2">
        <div className="flex items-center h-4 w-4">
          <Icon
            visual={icon}
            size="xs"
            className={cn("group-hover/summary-title:hidden", iconClassName)}
          />
          <Checkbox
            size="xs"
            className="hidden group-hover/summary-title:inline-block"
            checked={areAllSectionItemsChecked}
            onCheckedChange={(checked) => {
              if (checked === true) {
                onCheckSection(sectionItemKeys);
              }
            }}
          />
        </div>
        <h4 className="heading-lg text-foreground">{label}</h4>
      </div>

      {items.map((item) => {
        const itemKey = getSummaryItemKey(summaryCategory, item);
        const itemDiff = summaryItemDiffByKey[itemKey];
        const isChecked = checkedSummaryItems[itemKey] ?? false;
        const relatedConversationIds =
          summaryRelatedConversations[itemKey] ?? [];
        const isAdded = itemDiff === "added";
        const hasEntered = enteringItemKeys.has(itemKey);
        const isExiting = exitingItemKeys.has(itemKey);
        const shouldTypeChecklistItem =
          typingItemKeys.has(itemKey) && itemDiff === "modified";
        const autoCheckRationale = autoCheckRationaleByKey[itemKey];

        return (
          <div
            key={itemKey}
            className={cn(
              "flex items-start gap-3 overflow-hidden",
              "transition-all duration-200",
              isExiting
                ? "max-h-0 opacity-0"
                : isAdded && !hasEntered
                  ? "max-h-0 opacity-0"
                  : "max-h-32 opacity-100"
            )}
          >
            <Checkbox
              size="xs"
              className="mt-1"
              isMutedAfterCheck
              checked={isChecked}
              onCheckedChange={(checked) => {
                onCheckItem(itemKey, checked === true);
              }}
            />
            <div className="flex flex-col">
              <div
                className={cn(
                  "text-base min-h-6",
                  isChecked ? "text-faint line-through" : "text-foreground"
                )}
              >
                {shouldTypeChecklistItem ? (
                  <TypingAnimation
                    key={`${itemKey}-${typingVersion}`}
                    text={item.text}
                    duration={16}
                  />
                ) : (
                  renderSummaryItemText(item.text)
                )}
              </div>
              {isChecked && autoCheckRationale ? (
                <div className="text-xs text-faint">{autoCheckRationale}</div>
              ) : null}
              {relatedConversationIds.length === 0 ? null : (
                <div className="text-xs text-muted-foreground">
                  <span>In </span>
                  {relatedConversationIds.map((conversationId, index) => (
                    <span key={conversationId}>
                      <button
                        type="button"
                        className={cn(
                          "underline hover:no-underline",
                          isChecked ? "text-faint" : "text-muted-foreground"
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          onConversationClick(conversationId);
                        }}
                      >
                        {conversationTitleById.get(conversationId) ??
                          conversationId}
                      </button>
                      {index < relatedConversationIds.length - 1 && ", "}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
