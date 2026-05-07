import {
  Button,
  Card,
  Checkbox,
  Icon,
  SparklesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useRef, type ComponentType, type ReactNode } from "react";

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
  rejectAllLabel?: string;
  showDisabledCheckbox?: boolean;
  onTextChange: (id: string, text: string) => void;
  onAcceptItem: (id: string) => void;
  onRejectItem?: (id: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

function EditableSuggestionText({
  id,
  text,
  onTextChange,
}: {
  id: string;
  text: string;
  onTextChange: (id: string, text: string) => void;
}) {
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textRef.current && textRef.current.textContent !== text) {
      textRef.current.textContent = text;
    }
  }, [text]);

  return (
    <div
      ref={textRef}
      className="s-min-h-6 s-cursor-text s-text-base s-text-foreground s-outline-none focus:s-outline-none dark:s-text-foreground-night"
      contentEditable
      suppressContentEditableWarning
      onInput={(event) => {
        onTextChange(id, event.currentTarget.textContent ?? "");
      }}
      onBlur={(event) => {
        onTextChange(id, event.currentTarget.textContent ?? "");
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
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
  rejectAllLabel = "Dismiss all",
  showDisabledCheckbox = true,
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
          <div className="s-flex s-w-full s-items-center s-flex-col">
            {suggestionGroups.map((group, groupIndex) => (
              <div
                key={group.title ?? `suggestion-group-${groupIndex}`}
                className="s-flex s-w-full s-flex-col"
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
                    <div
                      key={item.id}
                      className="s-group/suggestion-item s-flex s-items-start s-gap-3 s-items-center s-pl-6"
                    >
                      {showDisabledCheckbox && (
                        <Checkbox
                          size="xs"
                          className="s-mt-1"
                          checked={false}
                          disabled
                        />
                      )}
                      {item.visual}
                      <div className="s-flex s-min-w-0 s-flex-1 s-flex-col">
                        {item.title && (
                          <div className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                            {item.title}
                          </div>
                        )}
                        <EditableSuggestionText
                          id={item.id}
                          text={text}
                          onTextChange={onTextChange}
                        />
                      </div>
                      <div className="s-flex s-items-center s-gap-1 s-opacity-0 s-transition-opacity group-hover/suggestion-item:s-opacity-100 group-focus-within/suggestion-item:s-opacity-100">
                        <Button
                          size="sm"
                          variant="outline"
                          label="Accept"
                          tooltip={acceptItemLabel}
                          aria-label={acceptItemLabel}
                          onClick={() => onAcceptItem(item.id)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="s-flex s-items-center s-justify-start s-gap-2">
            <Button
              size="sm"
              variant="outline"
              label={rejectAllLabel}
              onClick={onRejectAll}
            />
            <Button
              size="sm"
              variant="highlight-secondary"
              label={acceptAllLabel}
              onClick={onAcceptAll}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
