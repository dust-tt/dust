import { cn } from "@sparkle/lib/utils";
import type { Editor } from "@tiptap/core";
import React, {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { DocumentCommentInput } from "./DocumentCommentInput";
import type { DocumentCommentAuthor } from "./types";
import type { DocumentCommentsController } from "./useDocumentComments";
import { useEditorLayoutVersion } from "./useEditorLayoutVersion";

const COMPOSER_WIDTH_PX = 320;
const COMPOSER_GAP_PX = 8;

interface DocumentCommentComposerProps {
  editor: Editor;
  author: DocumentCommentAuthor;
  comments: DocumentCommentsController;
  containerRef: RefObject<HTMLElement>;
}

/**
 * @cc [owner:flvndvd,label:react] document-comment-composer
 * The composer MUST sit below the last line of the draft highlight, aligned with its start
 * and kept inside the document container. Escape anywhere in the composer, and pointer
 * presses outside it, MUST cancel the draft. Enter MUST submit the trimmed text.
 */
export const DocumentCommentComposer = ({
  editor,
  author,
  comments,
  containerRef,
}: DocumentCommentComposerProps) => {
  const [body, setBody] = useState("");
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const layoutVersion = useEditorLayoutVersion(editor);
  const { cancelDraft, submitDraft } = comments;

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

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !cardRef.current?.contains(event.target)
      ) {
        cancelDraft();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [cancelDraft]);

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="New comment"
      data-document-selection=""
      style={position ?? { top: 0, left: 0 }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancelDraft();
        }
      }}
      className={cn(
        "absolute z-40 w-80 max-w-full rounded-xl border border-border bg-overlay-background px-3 py-1.5 shadow-md print:hidden",
        position === null && "invisible"
      )}
    >
      <DocumentCommentInput
        label="Comment"
        placeholder="Add a comment…"
        author={author}
        value={body}
        onChange={setBody}
        onSubmit={submitDraft}
        // Hidden elements ignore focus(), so wait until the card is positioned.
        autoFocus={position !== null}
      />
    </div>
  );
};
