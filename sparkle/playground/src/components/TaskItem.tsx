import { Checkbox, Tooltip, cn } from "@dust-tt/sparkle";
import { cva } from "class-variance-authority";
import { useEffect, useRef, type ReactNode } from "react";

const taskItemTextVariants = cva("s-min-h-6 s-text-base", {
  variants: {
    editable: {
      true: "s-cursor-text s-outline-none focus:s-outline-none",
      false: "s-truncate",
    },
    editing: {
      true: "s-bg-highlight-50 dark:s-bg-highlight-100-night",
      false: "",
    },
    checked: {
      true: "s-text-faint s-line-through dark:s-text-faint-night",
      false: "s-text-foreground dark:s-text-foreground-night",
    },
  },
  compoundVariants: [
    {
      editable: false,
      editing: true,
      className: "",
    },
  ],
  defaultVariants: {
    editable: false,
    editing: false,
    checked: false,
  },
});

const taskItemActionsVariants = cva(
  "s-flex s-items-center s-gap-1 s-transition-opacity",
  {
    variants: {
      editing: {
        true: "s-opacity-0",
        false:
          "s-opacity-0 group-focus-within/task-item:s-opacity-100 group-hover/task-item:s-opacity-100",
      },
    },
    defaultVariants: {
      editing: false,
    },
  }
);

const relatedConversationLinkVariants = cva(
  "s-underline hover:s-no-underline",
  {
    variants: {
      checked: {
        true: "s-text-faint dark:s-text-faint-night",
        false: "s-text-muted-foreground dark:s-text-muted-foreground-night",
      },
    },
    defaultVariants: {
      checked: false,
    },
  }
);

export interface TaskItemRelatedConversation {
  id: string;
  label: string;
}

interface TaskItemProps {
  id: string;
  text: string;
  title?: string;
  visual?: ReactNode;
  isEditable: boolean;
  isChecked?: boolean;
  isDisabled?: boolean;
  isEditing?: boolean;
  isMutedAfterCheck?: boolean;
  showCheckbox?: boolean;
  checkboxClassName?: string;
  className?: string;
  actionsClassName?: string;
  textClassName?: string;
  renderText?: ReactNode;
  autoCheckRationale?: string;
  relatedConversations?: TaskItemRelatedConversation[];
  actions?: ReactNode;
  editorRef?: (node: HTMLDivElement | null) => void;
  onCheckedChange?: (checked: boolean) => void;
  onEditingChange?: (isEditing: boolean) => void;
  onTextChange?: (id: string, text: string) => void;
  onCommit?: (text: string) => void;
  onRemove?: () => void;
  onAddAfter?: () => void;
  onRelatedConversationClick?: (id: string) => void;
}

export function TaskItem({
  id,
  text,
  title,
  visual,
  isEditable,
  isChecked = false,
  isDisabled = false,
  isEditing = false,
  isMutedAfterCheck = false,
  showCheckbox = true,
  checkboxClassName,
  className,
  actionsClassName,
  textClassName,
  renderText,
  autoCheckRationale,
  relatedConversations = [],
  actions,
  editorRef,
  onCheckedChange,
  onEditingChange,
  onTextChange,
  onCommit,
  onRemove,
  onAddAfter,
  onRelatedConversationClick,
}: TaskItemProps) {
  const textRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isEditable || !textRef.current || renderText) {
      return;
    }

    if (textRef.current.textContent !== text) {
      textRef.current.textContent = text;
    }
  }, [isEditable, renderText, text]);

  const setTextNode = (node: HTMLDivElement | null) => {
    textRef.current = node;
    editorRef?.(node);
  };

  const handleTextChange = (nextText: string) => {
    onTextChange?.(id, nextText);
  };

  const handleCommit = (nextText: string) => {
    const trimmedText = nextText.trim();
    if (trimmedText.length === 0) {
      onRemove?.();
      return;
    }

    handleTextChange(nextText);
    onCommit?.(nextText);
  };

  const textElement = (
    <div
      className={cn(
        taskItemTextVariants({
          editable: isEditable,
          editing: isEditable && isEditing,
          checked: isChecked,
        }),
        textClassName
      )}
      contentEditable={isEditable}
      suppressContentEditableWarning
      ref={setTextNode}
      onFocus={() => {
        if (isEditable) {
          onEditingChange?.(true);
        }
      }}
      onInput={(event) => {
        if (isEditable) {
          handleTextChange(event.currentTarget.textContent ?? "");
        }
      }}
      onBlur={(event) => {
        if (!isEditable) {
          return;
        }

        onEditingChange?.(false);
        handleCommit(event.currentTarget.textContent ?? "");
      }}
      onKeyDown={(event) => {
        if (!isEditable) {
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if ((event.currentTarget.textContent ?? "").trim().length === 0) {
            onRemove?.();
            return;
          }
          event.currentTarget.textContent = text;
          event.currentTarget.blur();
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          handleCommit(event.currentTarget.textContent ?? "");
          onAddAfter?.();
        }
      }}
    >
      {renderText ?? text}
    </div>
  );

  return (
    <div
      className={cn(
        "s-group/task-item s-flex s-min-h-9 s-items-start s-gap-3",
        className
      )}
    >
      <div className="s-flex s-min-h-9 s-min-w-0 s-flex-1 s-items-start s-gap-3 s-pt-1">
        {showCheckbox && (
          <Checkbox
            size="sm"
            className={cn("s-mt-0.5", checkboxClassName)}
            isMutedAfterCheck={isMutedAfterCheck}
            checked={isChecked}
            disabled={isDisabled}
            onCheckedChange={(checked) => {
              if (!isEditable || isDisabled) {
                return;
              }
              onCheckedChange?.(checked === true);
            }}
          />
        )}
        {visual}
        <div className="s-flex s-min-w-0 s-flex-1 s-flex-col">
          {title && (
            <div className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
              {title}
            </div>
          )}
          {isEditable ? (
            textElement
          ) : (
            <Tooltip trigger={textElement} label={text} />
          )}
          {isChecked && autoCheckRationale ? (
            <div className="s-text-xs s-text-faint dark:s-text-faint-night">
              {autoCheckRationale}
            </div>
          ) : null}
          {relatedConversations.length > 0 ? (
            <div className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
              <span>In </span>
              {relatedConversations.map((conversation, index) => (
                <span key={conversation.id}>
                  <button
                    type="button"
                    className={relatedConversationLinkVariants({
                      checked: isChecked,
                    })}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRelatedConversationClick?.(conversation.id);
                    }}
                  >
                    {conversation.label}
                  </button>
                  {index < relatedConversations.length - 1 && ", "}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div
          className={cn(
            taskItemActionsVariants({ editing: isEditing }),
            actionsClassName
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
