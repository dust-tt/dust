import { Button, Card, Icon, Stars02, Spinner } from "@dust-tt/sparkle";
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
  headerIcon: HeaderIcon = Stars02,
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
        <div className="flex items-center gap-3 text-base text-muted-foreground">
          <Spinner size="xs" />
          <span>{workingLabel}</span>
        </div>
      ) : (
        <div className="group/suggestion-card flex w-full flex-col gap-4">
          {title && (
            <div className="heading-sm text-muted-foreground flex justify-start gap-2">
              <Icon visual={HeaderIcon} size="sm" />
              {title}
            </div>
          )}
          <div className="flex w-full items-center flex-col gap-4">
            {suggestionGroups.map((group, groupIndex) => (
              <div
                key={group.title ?? `suggestion-group-${groupIndex}`}
                className="flex w-full flex-col gap-1"
              >
                {(group.title || group.visual) && (
                  <div className="flex items-center gap-3">
                    {group.visual}
                    {group.title && (
                      <div className="heading-base text-muted-foreground">
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
                      className="pl-6"
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
          <div className="flex items-center justify-start gap-2">
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
