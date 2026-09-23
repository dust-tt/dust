import { Avatar } from "@sparkle/components/Avatar";
import { Icon } from "@sparkle/components/Icon";
import { TextArea } from "@sparkle/components/TextArea";
import { ArrowUp } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import React, { forwardRef, useImperativeHandle, useRef } from "react";
import type { DocumentCommentAuthor } from "./types";

interface DocumentCommentInputProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  author?: DocumentCommentAuthor;
  className?: string;
}

/**
 * @cc [owner:flvndvd,label:react] document-comment-input
 * Enter MUST submit and Shift+Enter MUST insert a line break, except while composing with an
 * IME. Blank text MUST NOT submit. The field MUST grow with its content instead of scrolling.
 */
export const DocumentCommentInput = forwardRef<
  HTMLTextAreaElement,
  DocumentCommentInputProps
>(
  (
    {
      label,
      placeholder,
      value,
      onChange,
      onSubmit,
      onCancel,
      author,
      className,
    },
    ref
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);
    const trimmed = value.trim();

    const submit = () => {
      if (trimmed) {
        onSubmit();
      }
    };

    return (
      <div
        className={cn("flex items-start gap-2", className)}
        onClick={(event) => event.stopPropagation()}
      >
        {author && (
          <Avatar
            size="xxs"
            isRounded
            name={author.name}
            visual={author.avatarUrl ?? undefined}
            className="mt-1"
          />
        )}
        {/* TextArea's own wrapper does not grow, so give it a flex item to fill. */}
        <div className="min-w-0 flex-1">
          <TextArea
            ref={textareaRef}
            aria-label={label}
            placeholder={placeholder}
            value={value}
            minRows={1}
            resize="none"
            onChange={(event) => {
              onChange(event.target.value);
              event.target.style.height = "auto";
              event.target.style.height = `${event.target.scrollHeight}px`;
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) {
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              } else if (event.key === "Escape" && onCancel) {
                event.preventDefault();
                onCancel();
              }
            }}
            className="min-h-7 rounded-none border-0 bg-transparent px-0 py-1 text-sm leading-5 shadow-none focus-visible:ring-0"
          />
        </div>
        <button
          type="button"
          aria-label="Send"
          tabIndex={trimmed ? 0 : -1}
          onClick={submit}
          className={cn(
            "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-50 transition-opacity motion-reduce:transition-none",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            trimmed ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          <Icon visual={ArrowUp} size="xs" />
        </button>
      </div>
    );
  }
);
DocumentCommentInput.displayName = "DocumentCommentInput";
