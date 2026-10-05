import {
  documentCommentsPluginKey,
  getCommentedTexts,
  getDocumentComments,
  scrollToCommentHighlight,
} from "@app/components/editor/document/DocumentComments";
import type { DfmComment } from "@app/lib/markdown/dfm";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useMemo, useRef, useState } from "react";

interface UseDocumentCommentsProps {
  editor: Editor | null;
}

interface EditorCommentsState {
  comments: DfmComment[];
  /** Commented text by comment id, in document order. */
  quotes: Map<string, string>;
  activeId: string | null;
}

const EMPTY_STATE: EditorCommentsState = {
  comments: [],
  quotes: new Map(),
  activeId: null,
};

/** Where the panel should move focus once it has rendered. */
export interface PanelFocusRequest {
  /** Thread to focus, or null for the panel heading. */
  threadId: string | null;
  nonce: number;
}

/**
 * @cc [owner:flvndvd;tdraier,label:react] document-comment-navigation
 * Selecting a thread MUST make it active and scroll its highlight into view. Revealing a
 * comment from a highlight or marker MUST open the panel and request focus on that thread.
 * Opening the panel from its toggle MUST request focus on the panel. Closing the panel while
 * focus is inside it MUST return focus to the toggle.
 */
export const useDocumentComments = ({ editor }: UseDocumentCommentsProps) => {
  const state =
    useEditorState({
      editor,
      selector: ({ editor }): EditorCommentsState => {
        if (!editor) {
          return EMPTY_STATE;
        }
        return {
          comments: getDocumentComments(editor.state.doc),
          quotes: getCommentedTexts(editor.state.doc),
          activeId:
            documentCommentsPluginKey.getState(editor.state)?.activeId ?? null,
        };
      },
    }) ?? EMPTY_STATE;
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<PanelFocusRequest | null>(
    null
  );
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  // Stable identity matters: the markers re-measure the DOM whenever this array changes.
  const unresolved = useMemo(
    () => state.comments.filter((comment) => comment.status === "open"),
    [state.comments]
  );

  const requestFocus = (threadId: string | null) =>
    setFocusRequest((current) => ({
      threadId,
      nonce: (current?.nonce ?? 0) + 1,
    }));

  const select = (id: string | null) => {
    editor?.commands.setActiveComment(id);
  };

  return {
    comments: state.comments,
    unresolved,
    quotes: state.quotes,
    activeId: state.activeId,
    panelOpen,
    focusRequest,
    toggleRef,
    panelRef,
    select,
    closePanel: () => {
      if (panelRef.current?.contains(document.activeElement)) {
        toggleRef.current?.focus();
      }
      setPanelOpen(false);
    },
    togglePanel: () => {
      if (!panelOpen) {
        requestFocus(null);
      }
      setPanelOpen((open) => !open);
    },
    /** Opens the panel on a comment, from a highlight or marker. */
    reveal: (id: string) => {
      select(id);
      setPanelOpen(true);
      requestFocus(id);
    },
    /** Activates a thread from the panel and scrolls to its text. */
    jumpTo: (id: string) => {
      select(id);
      if (editor) {
        scrollToCommentHighlight(editor, id);
      }
    },
  };
};

export type DocumentCommentsController = ReturnType<typeof useDocumentComments>;
