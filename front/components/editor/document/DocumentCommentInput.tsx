import type { DocumentProps } from "@app/components/editor/document/types";
import type { DfmAuthor } from "@app/lib/markdown/dfm";
import type { Result } from "@app/types/shared/result";
import {
  ArrowUp,
  cn,
  Edit04,
  Icon,
  Spinner,
  TextArea,
  Tooltip,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface DocumentCommentInputProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** Receives the trimmed text. */
  onSubmit: (body: string) => void | Promise<void>;
  /** Handles Escape inside the field. Without it Escape bubbles to the parent. */
  onCancel?: () => void;
  author?: DfmAuthor;
  renderAuthorAvatar: DocumentProps["renderCommentAuthorAvatar"];
  /** Why the last submission was refused, shown under the field. */
  error?: string | null;
  /** Focuses the field while true, once it is visible. */
  autoFocus?: boolean;
  /** A submission is being sent: the text is frozen and Send shows progress. */
  pending?: boolean;
  onSuggest?: () => Result<string, string>;
  mountPortalContainer?: HTMLElement;
  className?: string;
}

interface Selection {
  start: number;
  end: number;
}

/**
 * @cc [owner:tdraier,label:react] document-comment-input-suggest
 * With onSuggest, the field MUST offer a Suggest button that appends the suggestion block after
 * the typed text, separated by a blank line, focuses the field and selects the block's text so
 * typing replaces it. A refused suggestion MUST leave the text unchanged and show the reason
 * until the text changes or is submitted. While pending, Suggest MUST NOT change the text.
 */
/**
 * @cc [owner:flvndvd;tdraier,label:react] document-comment-input
 * Enter MUST submit and Shift+Enter MUST insert a line break, except while an input method
 * is composing text. Blank text MUST NOT submit. The field's height MUST follow its value,
 * including when the value is cleared. While pending, the text MUST NOT change or submit again,
 * and Send MUST show progress.
 */
export const DocumentCommentInput = ({
  label,
  placeholder,
  value,
  onChange,
  onSubmit,
  onCancel,
  author,
  renderAuthorAvatar,
  error,
  autoFocus = false,
  pending = false,
  onSuggest,
  mountPortalContainer,
  className,
}: DocumentCommentInputProps) => {
  const { t } = useLingui();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelectionRef = useRef<Selection | null>(null);
  const [refusedSuggestion, setRefusedSuggestion] = useState<{
    reason: string;
    value: string;
  } | null>(null);
  // A refusal shows only while the text it was raised on stays as it is.
  const suggestError =
    refusedSuggestion?.value === value ? refusedSuggestion.reason : null;
  const trimmed = value.trim();

  // Runs on every value change, though it reads none: the height follows the rendered value.
  useLayoutEffect(() => {
    const field = textareaRef.current;
    if (field) {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight}px`;
    }
    const selection = pendingSelectionRef.current;
    if (field && selection) {
      pendingSelectionRef.current = null;
      field.focus();
      field.setSelectionRange(selection.start, selection.end);
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  const submit = () => {
    if (trimmed && !pending) {
      setRefusedSuggestion(null);
      void onSubmit(trimmed);
    }
  };

  const suggest = () => {
    if (pending) {
      return;
    }
    const block = onSuggest?.();
    if (!block) {
      return;
    }
    if (block.isErr()) {
      setRefusedSuggestion({ reason: block.error, value });
      return;
    }
    setRefusedSuggestion(null);
    const prefix = value.trimEnd() ? `${value.trimEnd()}\n\n` : "";
    const start = prefix.length + block.value.indexOf("\n") + 1;
    const end = prefix.length + block.value.lastIndexOf("\n");
    pendingSelectionRef.current = { start, end: Math.max(start, end) };
    onChange(`${prefix}${block.value}`);
  };

  return (
    <div className={className} onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start gap-2">
        {author && (
          <span aria-hidden="true" className="mt-1">
            {renderAuthorAvatar(author, "xxs")}
          </span>
        )}
        {/* TextArea's own wrapper does not grow, so give it a flex item to fill. */}
        <div className="min-w-0 flex-1">
          <TextArea
            ref={textareaRef}
            aria-label={label}
            placeholder={placeholder}
            value={value}
            readOnly={pending}
            aria-busy={pending}
            minRows={1}
            resize="none"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) {
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              } else if (event.key === "Escape" && onCancel) {
                event.preventDefault();
                event.stopPropagation();
                onCancel();
              }
            }}
            className="min-h-7 rounded-none border-0 bg-transparent px-0 py-1 text-sm leading-5 shadow-none focus-visible:ring-0"
          />
        </div>
        {onSuggest && (
          <Tooltip
            label="Suggest a change"
            tooltipTriggerAsChild
            mountPortalContainer={mountPortalContainer}
            trigger={
              <button
                type="button"
                aria-label="Suggest a change"
                aria-disabled={pending}
                onClick={suggest}
                className={cn(
                  "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground motion-reduce:transition-none",
                  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
              >
                <Icon visual={Edit04} size="xs" />
              </button>
            }
          />
        )}
        <button
          type="button"
          aria-label={pending ? t`Sending` : t`Send`}
          aria-disabled={pending}
          tabIndex={trimmed ? 0 : -1}
          onClick={submit}
          className={cn(
            "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-50 transition-opacity motion-reduce:transition-none",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            trimmed ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          {pending ? (
            <Spinner size="xs" variant="revert" />
          ) : (
            <Icon visual={ArrowUp} size="xs" />
          )}
        </button>
      </div>
      {(suggestError ?? error) && (
        <p role="alert" className="pb-1 text-xs text-warning-500">
          {suggestError ?? error}
        </p>
      )}
    </div>
  );
};
