import { Button, Card, Icon, SparklesIcon, Spinner } from "@dust-tt/sparkle";
import { type ComponentProps, type ComponentType, type ReactNode } from "react";

import { TaskItem } from "./TaskItem";

export interface SuggestionBoxItem {
  id: string;
  title?: string;
  groupTitle?: string;
  groupVisual?: ReactNode;
  text: string;
  visual?: ReactNode;
}

interface SuggestionBoxProps {
  status: "working" | "ready";
  workingLabel: string;
  title?: string;
  headerIcon?: ComponentType<{ className?: string }>;
  items: SuggestionBoxItem[];
  textById?: Record<string, string>;
  acceptItemLabel?: string;
  rejectItemLabel?: string;
  acceptAllLabel?: string;
  acceptAllButtonVariant?: ComponentProps<typeof Button>["variant"];
  acceptAllIcon?: ComponentProps<typeof Button>["icon"];
  rejectAllLabel?: string;
  showDisabledCheckbox?: boolean;
  showItemAcceptAction?: boolean;
  showRejectAllAction?: boolean;
  onTextChange: (id: string, text: string) => void;
  onAcceptItem: (id: string) => void;
  onRejectItem?: (id: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

export function SuggestionBox({
  status,
  workingLabel,
  title,
  headerIcon: HeaderIcon = SparklesIcon,
  items,
  textById = {},
  acceptItemLabel = "Accept suggestion",
  rejectItemLabel = "Reject suggestion",
  acceptAllLabel = "Accept all",
  acceptAllButtonVariant = "highlight-secondary",
  acceptAllIcon,
  rejectAllLabel = "Dismiss all",
  showDisabledCheckbox = true,
  showItemAcceptAction = true,
  showRejectAllAction = true,
  onTextChange,
  onAcceptItem,
  onRejectItem,
  onAcceptAll,
  onRejectAll,
}: SuggestionBoxProps) {
  const suggestionGroups = items.reduce<
    Array<{ title?: string; visual?: ReactNode; items: SuggestionBoxItem[] }>
  >((groups, item) => {
    const group = groups.find((group) => group.title === item.groupTitle);
    if (group) {
      group.items.push(item);
      return groups;
    }

    groups.push({
      title: item.groupTitle,
      visual: item.groupVisual,
      items: [item],
    });
    return groups;
  }, []);

  return (
    <Card variant="primary" size="md">
      {status === "working" ? (
        <div className="s-flex s-items-center s-gap-3 s-text-base s-text-muted-foreground dark:s-text-muted-foreground-night">
          <Spinner size="xs" />
          <span>{workingLabel}</span>
        </div>
      ) : (
        <div className="s-group/suggestion-card s-flex s-w-full s-flex-col s-gap-4">
          {title && (
            <div className="s-heading-sm s-text-muted-foreground s-flex s-justify-start s-gap-2">
              <Icon visual={HeaderIcon} size="sm" />
              {title}
            </div>
          )}
          <div className="s-flex s-w-full s-items-center s-flex-col s-gap-4">
            {suggestionGroups.map((group, groupIndex) => (
              <div
                key={group.title ?? `suggestion-group-${groupIndex}`}
                className="s-flex s-w-full s-flex-col s-gap-1"
              >
                {(group.title || group.visual) && (
                  <div className="s-flex s-items-center s-gap-3">
                    {group.visual}
                    {group.title && (
                      <div className="s-heading-base s-text-muted-foreground dark:s-text-foreground-night">
                        {group.title}
                      </div>
                    )}
                  </div>
                )}
                {group.items.map((item) => {
                  const text = textById[item.id] ?? item.text;

                  return (
                    <TaskItem
                      key={item.id}
                      id={item.id}
                      text={text}
                      title={item.title}
                      visual={item.visual}
                      className="s-pl-6"
                      isEditable
                      isDisabled
                      showCheckbox={showDisabledCheckbox}
                      onTextChange={onTextChange}
                      actions={
                        showItemAcceptAction ? (
                          <Button
                            size="sm"
                            variant="outline"
                            label="Accept"
                            tooltip={acceptItemLabel}
                            aria-label={acceptItemLabel}
                            onClick={() => onAcceptItem(item.id)}
                          />
                        ) : null
                      }
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="s-flex s-items-center s-justify-start s-gap-2">
            {showRejectAllAction && (
              <Button
                size="sm"
                variant="outline"
                label={rejectAllLabel}
                onClick={onRejectAll}
              />
            )}
            <Button
              size="sm"
              variant={acceptAllButtonVariant}
              icon={acceptAllIcon}
              label={acceptAllLabel}
              onClick={onAcceptAll}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
