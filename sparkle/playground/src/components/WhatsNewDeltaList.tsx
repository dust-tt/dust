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
    <div className="s-flex s-flex-col s-gap-2">
      <div className="s-group/summary-title s-flex s-items-center s-gap-3 s-pt-2">
        <div className="s-flex s-items-center s-h-4 s-w-4">
          <Icon
            visual={icon}
            size="xs"
            className={cn("group-hover/summary-title:s-hidden", iconClassName)}
          />
          <Checkbox
            size="xs"
            className="s-hidden group-hover/summary-title:s-inline-block"
            checked={areAllSectionItemsChecked}
            onCheckedChange={(checked) => {
              if (checked === true) {
                onCheckSection(sectionItemKeys);
              }
            }}
          />
        </div>
        <h4 className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
          {label}
        </h4>
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
              "s-flex s-items-start s-gap-3 s-overflow-hidden",
              "s-transition-all s-duration-200",
              isExiting
                ? "s-max-h-0 s-opacity-0"
                : isAdded && !hasEntered
                  ? "s-max-h-0 s-opacity-0"
                  : "s-max-h-32 s-opacity-100"
            )}
          >
            <Checkbox
              size="xs"
              className="s-mt-1"
              isMutedAfterCheck
              checked={isChecked}
              onCheckedChange={(checked) => {
                onCheckItem(itemKey, checked === true);
              }}
            />
            <div className="s-flex s-flex-col">
              <div
                className={cn(
                  "s-text-base s-min-h-6",
                  isChecked
                    ? "s-text-faint s-line-through dark:s-text-faint-night"
                    : "s-text-foreground dark:s-text-foreground-night"
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
                <div className="s-text-xs s-text-faint dark:s-text-faint-night">
                  {autoCheckRationale}
                </div>
              ) : null}
              {relatedConversationIds.length === 0 ? null : (
                <div className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                  <span>In </span>
                  {relatedConversationIds.map((conversationId, index) => (
                    <span key={conversationId}>
                      <button
                        type="button"
                        className={cn(
                          "s-underline hover:s-no-underline",
                          isChecked
                            ? "s-text-faint dark:s-text-faint-night"
                            : "s-text-muted-foreground dark:s-text-muted-foreground-night"
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
