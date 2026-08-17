import { cn } from "@sparkle/lib/utils";
import React, {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { PopoverAnchor, PopoverContent, PopoverRoot } from "./Popover";

export const COMPOSER_SUGGESTION_TRIGGERS = ["/", "@"] as const;
export type ComposerSuggestionTriggerType =
  (typeof COMPOSER_SUGGESTION_TRIGGERS)[number];

export interface ComposerSuggestionItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  visual?: string;
}

export interface ComposerSuggestionSource {
  trigger: ComposerSuggestionTriggerType;
  items: ComposerSuggestionItem[];
  onSelect: (item: ComposerSuggestionItem, query: string) => void;
}

interface ComposerInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  suggestions?: ComposerSuggestionSource[];
  className?: string;
}

interface ActiveSuggestionState {
  trigger: ComposerSuggestionTriggerType;
  query: string;
  selectedIndex: number;
}

const EMPTY_SUGGESTIONS: ComposerSuggestionSource[] = [];

function isSuggestionTrigger(
  char: string
): char is ComposerSuggestionTriggerType {
  return COMPOSER_SUGGESTION_TRIGGERS.some((t) => t === char);
}

function getActiveSuggestion(
  value: string,
  cursorPos: number
): { trigger: ComposerSuggestionTriggerType; query: string } | null {
  const textBeforeCursor = value.slice(0, cursorPos);
  const match = textBeforeCursor.match(/(^|\s)([/@])(\S*)$/);
  if (!match || !isSuggestionTrigger(match[2])) {
    return null;
  }
  return { trigger: match[2], query: match[3] };
}

function removeActiveSuggestion(value: string, cursorPos: number): string {
  const before = value.slice(0, cursorPos);
  const after = value.slice(cursorPos);
  return before.replace(/(^|\s)[/@]\S*$/, "$1") + after;
}

function filterItems(
  items: ComposerSuggestionItem[],
  query: string
): ComposerSuggestionItem[] {
  if (!query) {
    return items;
  }
  const normalizedQuery = query.toLowerCase();
  return items.filter((item) =>
    item.label.toLowerCase().includes(normalizedQuery)
  );
}

export const ComposerInput = React.forwardRef<
  HTMLTextAreaElement,
  ComposerInputProps
>(function ComposerInput(
  {
    value,
    onChange,
    onSubmit,
    onFocus,
    onBlur,
    placeholder = "Get work done",
    disabled = false,
    autoFocus = false,
    suggestions = EMPTY_SUGGESTIONS,
    className,
  },
  ref
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle<HTMLTextAreaElement | null, HTMLTextAreaElement | null>(
    ref,
    () => textareaRef.current
  );

  const [active, setActive] = useState<ActiveSuggestionState | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: value drives the resize.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const activeSource = useMemo(
    () =>
      active
        ? (suggestions.find((s) => s.trigger === active.trigger) ?? null)
        : null,
    [active, suggestions]
  );

  const filteredItems = useMemo(
    () =>
      active && activeSource
        ? filterItems(activeSource.items, active.query)
        : [],
    [active, activeSource]
  );

  const closeSuggestions = useCallback(() => {
    setActive(null);
  }, []);

  const selectItem = useCallback(
    (item: ComposerSuggestionItem) => {
      const el = textareaRef.current;
      if (!el || !active || !activeSource) {
        return;
      }
      const cursorPos = el.selectionStart ?? value.length;
      onChange(removeActiveSuggestion(value, cursorPos));
      activeSource.onSelect(item, active.query);
      closeSuggestions();
      requestAnimationFrame(() => el.focus());
    },
    [active, activeSource, value, onChange, closeSuggestions]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      const cursorPos = e.target.selectionStart ?? newValue.length;
      const suggestion = getActiveSuggestion(newValue, cursorPos);
      const hasSource =
        suggestion != null &&
        suggestions.some((s) => s.trigger === suggestion.trigger);

      setActive(hasSource ? { ...suggestion, selectedIndex: 0 } : null);
    },
    [onChange, suggestions]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (active && filteredItems.length > 0) {
        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setActive((s) =>
              s
                ? {
                    ...s,
                    selectedIndex: (s.selectedIndex + 1) % filteredItems.length,
                  }
                : s
            );
            return;
          case "ArrowUp":
            e.preventDefault();
            setActive((s) =>
              s
                ? {
                    ...s,
                    selectedIndex:
                      (s.selectedIndex - 1 + filteredItems.length) %
                      filteredItems.length,
                  }
                : s
            );
            return;
          case "Enter":
          case "Tab": {
            e.preventDefault();
            const item = filteredItems[active.selectedIndex];
            if (item) {
              selectItem(item);
            }
            return;
          }
          case "Escape":
            e.preventDefault();
            closeSuggestions();
            return;
        }
      }

      // Enter with the suggestion list showing is handled above; an active
      // trigger with zero matches must not swallow the submit.
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        onSubmit?.(value);
      }
    },
    [active, filteredItems, selectItem, closeSuggestions, value, onSubmit]
  );

  const isOpen = active != null && filteredItems.length > 0;

  const textareaClassName = cn(
    "block w-full resize-none bg-transparent p-0",
    "max-h-[40vh] min-h-11 overflow-y-auto",
    "text-base text-foreground placeholder:text-faint dark:placeholder:text-stone-400",
    "border-none outline-none focus:outline-none focus:ring-0",
    "disabled:cursor-not-allowed disabled:opacity-50",
    className
  );

  return (
    <PopoverRoot
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeSuggestions();
        }
      }}
    >
      <PopoverAnchor asChild>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          rows={1}
          className={textareaClassName}
        />
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex max-h-72 flex-col overflow-y-auto">
          {filteredItems.map((item, i) => {
            const isSelected = active?.selectedIndex === i;
            return (
              <button
                key={item.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectItem(item);
                }}
                onMouseEnter={() =>
                  setActive((s) => (s ? { ...s, selectedIndex: i } : s))
                }
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                  isSelected ? "bg-hover" : "bg-transparent"
                )}
              >
                {item.visual != null ? (
                  <Avatar size="xs" name={item.label} visual={item.visual} />
                ) : (
                  item.icon && (
                    <Icon
                      visual={item.icon}
                      size="sm"
                      className="text-muted-foreground"
                    />
                  )
                )}
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {active?.trigger === "/" ? `/${item.label}` : item.label}
                  </span>
                  {item.description && (
                    <span className="truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
});
