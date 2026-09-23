import { Avatar } from "@sparkle/components/Avatar";
import { Button } from "@sparkle/components/Button";
import { TextArea } from "@sparkle/components/TextArea";
import { cn } from "@sparkle/lib/utils";
import type { Editor } from "@tiptap/core";
import React, {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { DocumentCommentAuthor } from "./types";
import { useEditorLayoutVersion } from "./useDocumentComments";

const COMPOSER_WIDTH_PX = 320;
const COMPOSER_GAP_PX = 8;

interface DocumentCommentComposerProps {
  editor: Editor;
  author: DocumentCommentAuthor;
  containerRef: RefObject<HTMLElement>;
  onCancel: () => void;
  onSubmit: (body: string) => void;
}

/**
 * @cc [owner:flvndvd,label:react] document-comment-composer
 * The composer MUST sit below the last line of the draft highlight, aligned with its start
 * and kept inside the document container. Escape, and pointer presses outside the composer,
 * MUST cancel the draft. Cmd/Ctrl+Enter MUST submit. Blank comments MUST NOT be submitted.
 */
export const DocumentCommentComposer = ({
  editor,
  author,
  containerRef,
  onCancel,
  onSubmit,
}: DocumentCommentComposerProps) => {
  const [body, setBody] = useState("");
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const layoutVersion = useEditorLayoutVersion(editor);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: layoutVersion re-measures after document changes and resizes
  useLayoutEffect(() => {
    const container = containerRef.current;
    const highlights = editor.view.dom.querySelectorAll<HTMLElement>(
      "[data-comment-draft]"
    );
    if (!container || highlights.length === 0) {
      setPosition(null);
      return;
    }

    const containerBounds = container.getBoundingClientRect();
    const start = highlights[0].getBoundingClientRect().left;
    let bottom = -Infinity;
    highlights.forEach((highlight) => {
      bottom = Math.max(bottom, highlight.getBoundingClientRect().bottom);
    });
    const width = Math.min(COMPOSER_WIDTH_PX, containerBounds.width);

    setPosition({
      top: bottom - containerBounds.top + COMPOSER_GAP_PX,
      left: Math.max(
        0,
        Math.min(start - containerBounds.left, containerBounds.width - width)
      ),
    });
  }, [editor, containerRef, layoutVersion]);

  // Focus once the card is positioned and visible; hidden elements ignore focus().
  const positioned = position !== null;
  useEffect(() => {
    if (positioned) {
      textareaRef.current?.focus();
    }
  }, [positioned]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !cardRef.current?.contains(event.target)
      ) {
        onCancel();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onCancel]);

  const trimmed = body.trim();
  const submit = () => {
    if (trimmed) {
      onSubmit(trimmed);
    }
  };

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="New comment"
      data-document-selection=""
      style={position ?? { top: 0, left: 0 }}
      className={cn(
        "absolute z-40 flex w-80 max-w-full flex-col gap-2 rounded-xl border border-border bg-overlay-background p-3 shadow-lg print:hidden",
        position === null && "invisible"
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          submit();
        }
      }}
    >
      <div className="flex items-center gap-2">
        <Avatar
          size="xxs"
          isRounded
          name={author.name}
          visual={author.avatarUrl ?? undefined}
        />
        <span className="truncate text-sm font-medium">{author.name}</span>
      </div>
      <TextArea
        ref={textareaRef}
        aria-label="Comment"
        placeholder="Add a comment…"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        minRows={2}
        resize="none"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"}+Enter to
          post
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            label="Cancel"
            onClick={onCancel}
          />
          <Button
            type="button"
            variant="primary"
            size="xs"
            label="Comment"
            disabled={!trimmed}
            onClick={submit}
          />
        </div>
      </div>
    </div>
  );
};
