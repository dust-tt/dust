import { Checkbox, Tooltip, cn } from "@dust-tt/sparkle";
import { cva } from "class-variance-authority";
import { useEffect, useRef, type ReactNode } from "react";

const taskItemTextVariants = cva("min-h-6 text-base text-left", {
  variants: {
    editable: {
      true: "cursor-text outline-hidden focus:outline-hidden",
      false: "truncate",
    },
    editing: {
      true: "bg-highlight-50",
      false: "",
    },
    checked: {
      true: "text-faint line-through",
      false: "text-foreground",
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
  "flex items-center gap-1 transition-opacity",
  {
    variants: {
      editing: {
        true: "opacity-0",
        false:
          "opacity-0 group-focus-within/task-item:opacity-100 group-hover/task-item:opacity-100",
      },
    },
    defaultVariants: {
      editing: false,
    },
  }
);

const relatedConversationLinkVariants = cva("underline hover:no-underline", {
  variants: {
    checked: {
      true: "text-faint",
      false: "text-muted-foreground",
    },
  },
  defaultVariants: {
    checked: false,
  },
});

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
        "group/task-item flex min-h-9 items-start gap-3",
        className
      )}
    >
      <div className="flex min-h-9 min-w-0 flex-1 items-start gap-3 pt-1">
        {showCheckbox && (
          <Checkbox
            size="sm"
            className={cn(
              "mt-0.5",
              !isEditable && "pointer-events-none",
              checkboxClassName
            )}
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
        <div className="flex min-w-0 flex-1 flex-col text-left">
          {title && (
            <div className="text-xs text-muted-foreground">{title}</div>
          )}
          {isEditable ? (
            textElement
          ) : (
            <Tooltip trigger={textElement} label={text} />
          )}
          {isChecked && autoCheckRationale ? (
            <div className="text-xs text-faint text-left">
              {autoCheckRationale}
            </div>
          ) : null}
          {relatedConversations.length > 0 ? (
            <div className="text-xs text-muted-foreground">
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
