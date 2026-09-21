"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { getSchema, isTextSelection, type JSONContent } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { StarterKit } from "@tiptap/starter-kit";
import {
  AlertCircle,
  Bold,
  Check,
  Code,
  CornerDownLeft,
  Italic,
  LoaderCircle,
  Strikethrough,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { BLOCKS, getBlockQuery } from "./blocks";
import { DOCUMENT_STYLES } from "./styles";

export type DocumentSaveResult = { ok: true } | { ok: false; error: string };

/**
 * A document editor with fixed typography, slash commands, and selection-only formatting.
 * Accepts Markdown or saved JSON and autosaves serialized JSON through the host callback.
 * Hosts own storage and authorization; omitting onSave renders a read-only document.
 */
export interface DocumentProps {
  /** Already stored content. Remount with a new key to open another document. */
  initialContent: string;
  contentType?: "markdown" | "json";
  /** Classes for the outer container, for layout and surface styling. */
  className?: string;
  readOnly?: boolean;
  /** Receives an opaque serialized document; resolve only after persistence succeeds. */
  onSave?: (contentJson: string) => Promise<DocumentSaveResult>;
}

const extensions = [
  StarterKit,
  Markdown,
  Placeholder.configure({
    placeholder: ({ node, pos, editor }) =>
      node.type.name === "heading"
        ? pos === 0
          ? "Untitled"
          : "Heading"
        : node.type.name === "paragraph"
          ? editor.isEmpty
            ? "Start writing, or type / for blocks…"
            : "Type / for blocks…"
          : "",
  }),
];
const documentSchema = getSchema(extensions);
const documentEnvelope = z.object({ type: z.literal("doc") }).passthrough();

function parseContent(
  content: string,
  contentType: "markdown" | "json"
): { ok: true; content: string | JSONContent } | { ok: false } {
  if (contentType === "markdown") {
    return { ok: true, content };
  }
  try {
    const parsed = documentEnvelope.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return { ok: false };
    }
    const node = documentSchema.nodeFromJSON(parsed.data);
    node.check();
    return { ok: true, content: node.toJSON() };
  } catch {
    return { ok: false };
  }
}

/**
 * @cc [owner:flvndvd,label:product] document-ui-owned-by-sparkle
 * Document MUST own its typography and formatting controls. Inline controls MUST appear only
 * for a nonempty text selection; block commands MUST appear only after typing `/` in an
 * editable document. Callers supply content and a persistence callback, not an editor
 * instance, extensions, or toolbar configuration. className MUST apply to the outer container;
 * the inner reading surface and formatting controls remain owned by Document.
 */
/**
 * @cc [owner:flvndvd,label:product] document-draft-preservation
 * Failed saves MUST preserve the draft. A successful save MUST acknowledge only the submitted
 * content; edits made during the request MUST remain unsaved. Prop changes MUST NOT replace an
 * open draft. Invalid stored content MUST disable editing and saving rather than discard it.
 */
/**
 * @cc [owner:flvndvd,label:product] document-read-only
 * When readOnly is true or onSave is absent, Document MUST disable editing, formatting
 * controls, and save callbacks. Hosts MUST apply their permissions through readOnly.
 */
/**
 * @cc [owner:flvndvd,label:product] document-autosave
 * Dirty, editable content MUST autosave after three seconds without edits, with at most one save in flight.
 * Failure MUST suspend automatic retries until the user explicitly retries. Unchanged content
 * MUST NOT trigger saves. Cmd/Ctrl+S MUST allow an immediate save using the same callback.
 */
export function Document({
  initialContent,
  contentType = "markdown",
  className,
  readOnly = false,
  onSave,
}: DocumentProps) {
  const [initial] = useState(() => ({
    ...parseContent(initialContent, contentType),
    contentType,
  }));
  const [baseline, setBaseline] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = React.useRef(false);
  const [highlight, setHighlight] = useState({ queryKey: "", index: 0 });
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  const blocksMenuId = React.useId();
  const isApple =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);
  const editable = !readOnly && onSave !== undefined && initial.ok;
  const editor = useEditor({
    extensions,
    content: initial.ok ? initial.content : "",
    contentType: initial.contentType,
    immediatelyRender: false,
    editable,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Document content",
        "aria-multiline": "true",
        class: "dust-document-body",
      },
    },
    onCreate: ({ editor }) => {
      // Normalize extension-added content (e.g. the trailing paragraph) before the saved baseline.
      editor.view.dispatch(editor.state.tr);
      const content = JSON.stringify(editor.getJSON());
      setBaseline(content);
      setDraft(content);
    },
    onUpdate: ({ editor }) => setDraft(JSON.stringify(editor.getJSON())),
  });
  const selection = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      strike: editor?.isActive("strike") ?? false,
      code: editor?.isActive("code") ?? false,
      blockQuery: editor ? getBlockQuery(editor.state) : null,
    }),
  });
  const blockQuery = selection?.blockQuery;
  const queryKey = blockQuery ? `${blockQuery.from}:${blockQuery.query}` : "";
  const blocks = BLOCKS.filter((block) =>
    `${block.name} ${block.keywords}`
      .toLowerCase()
      .includes(blockQuery?.query.toLowerCase() ?? "")
  );
  const activeIndex =
    highlight.queryKey === queryKey
      ? Math.min(highlight.index, blocks.length - 1)
      : 0;
  const showBlocks = editable && !!blockQuery && dismissedQuery !== queryKey;

  function insertBlock(index: number) {
    const block = blocks[index];
    if (editor && blockQuery && block) {
      block.apply(
        editor
          .chain()
          .focus()
          .deleteRange({ from: blockQuery.from, to: blockQuery.to })
      );
      setDismissedQuery(null);
      setHighlight({ queryKey: "", index: 0 });
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (
      event.nativeEvent.isComposing ||
      !(event.target instanceof Node) ||
      !editor?.view.dom.contains(event.target)
    ) {
      return;
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "s"
    ) {
      event.preventDefault();
      void save();
      return;
    }
    if (!showBlocks) {
      if (dismissedQuery !== null) {
        setDismissedQuery(null);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setDismissedQuery(queryKey);
    } else if (
      blocks.length > 0 &&
      ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Enter") {
        insertBlock(activeIndex);
      } else {
        const index =
          (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + blocks.length) %
          blocks.length;
        setHighlight({ queryKey, index });
        document
          .getElementById(`${blocksMenuId}-${index}`)
          ?.scrollIntoView({ block: "nearest" });
      }
    }
  }

  const dirty = baseline !== null && draft !== baseline;

  const save = useCallback(async () => {
    if (!editor || !onSave || !editable || !dirty || savingRef.current) {
      return;
    }
    const content = JSON.stringify(editor.getJSON());
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      // Persistence belongs to the host and may reject on a transport error.
      const result = await onSave(content);
      if (result.ok) {
        setBaseline(content);
      } else {
        setError(
          result.error ||
            "Could not save. Your changes are still here. Try again."
        );
      }
    } catch {
      setError("Could not save. Your changes are still here. Try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [editor, onSave, editable, dirty]);

  useEffect(() => {
    if (draft === null || !dirty || saving || error || !editable) {
      return;
    }
    // Debounce document changes, including edits made during an earlier save. Never retry errors in a loop.
    const timeout = setTimeout(() => void save(), 3_000);
    return () => clearTimeout(timeout);
  }, [draft, dirty, saving, error, editable, save]);

  if (!initial.ok) {
    return (
      <article className={className}>
        <p role="alert">
          This document could not be opened. Its saved content has not been
          changed.
        </p>
      </article>
    );
  }

  return (
    <article className={className} onKeyDownCapture={onKeyDown}>
      <div className="dust-document">
        {editable && (
          <div
            className="dust-document-save"
            data-state={
              error ? "error" : saving ? "saving" : dirty ? "pending" : "saved"
            }
          >
            <span
              role="status"
              title="Changes save automatically after 3 seconds of inactivity"
            >
              {error ? (
                <AlertCircle size={14} aria-hidden="true" />
              ) : saving ? (
                <LoaderCircle
                  size={14}
                  className="dust-document-spinner"
                  aria-hidden="true"
                />
              ) : dirty ? (
                <span className="dust-document-pending" aria-hidden="true" />
              ) : (
                <Check size={14} aria-hidden="true" />
              )}
              {error
                ? "Not saved"
                : saving
                  ? "Saving…"
                  : dirty
                    ? "Changes pending"
                    : "Saved"}
            </span>
            {error && (
              <button type="button" onClick={save}>
                Retry
              </button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="dust-document-error">
            {error}
          </p>
        )}
        {editor && editable && (
          <Tooltip.Provider delayDuration={450}>
            <BubbleMenu
              editor={editor}
              options={{ placement: "top" }}
              className="dust-document-popup"
              shouldShow={({ editor, state, from, to }) =>
                editor.isEditable &&
                isTextSelection(state.selection) &&
                !state.selection.empty &&
                state.doc.textBetween(from, to).length > 0 &&
                (editor.isFocused ||
                  !!document.activeElement?.closest(".dust-document-selection"))
              }
            >
              <div
                role="toolbar"
                aria-label="Format selection"
                className="dust-document-selection"
              >
                {[
                  {
                    label: "Bold",
                    shortcut: isApple ? "⌘ B" : "Ctrl B",
                    icon: Bold,
                    active: selection?.bold,
                    run: () => editor.chain().focus().toggleBold().run(),
                  },
                  {
                    label: "Italic",
                    shortcut: isApple ? "⌘ I" : "Ctrl I",
                    icon: Italic,
                    active: selection?.italic,
                    run: () => editor.chain().focus().toggleItalic().run(),
                  },
                  {
                    label: "Strikethrough",
                    shortcut: isApple ? "⌘ ⇧ S" : "Ctrl Shift S",
                    icon: Strikethrough,
                    active: selection?.strike,
                    run: () => editor.chain().focus().toggleStrike().run(),
                  },
                  {
                    label: "Inline code",
                    shortcut: isApple ? "⌘ E" : "Ctrl E",
                    icon: Code,
                    active: selection?.code,
                    run: () => editor.chain().focus().toggleCode().run(),
                  },
                ].map(({ label, shortcut, icon: Icon, active, run }) => (
                  <Tooltip.Root key={label}>
                    <Tooltip.Trigger asChild>
                      <button
                        type="button"
                        aria-label={label}
                        data-format={
                          label === "Inline code" ? "code" : undefined
                        }
                        aria-pressed={active}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={run}
                      >
                        <Icon size={16} aria-hidden="true" />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        side="bottom"
                        sideOffset={8}
                        className="dust-document-popup dust-document-tooltip"
                      >
                        <span>{label}</span>
                        <kbd>{shortcut}</kbd>
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                ))}
              </div>
            </BubbleMenu>
          </Tooltip.Provider>
        )}
        {/* Keep the plugin mounted while editing. Mounting an already-open BubbleMenu under
          StrictMode lets its deferred cleanup detach the visible popup. */}
        {editor && editable && (
          <BubbleMenu
            editor={editor}
            pluginKey="document-block-menu"
            updateDelay={0}
            options={{ placement: "bottom-start", offset: 8 }}
            className="dust-document-popup"
            shouldShow={({ editor, state }) =>
              editor.isEditable &&
              editor.isFocused &&
              getBlockQuery(state) !== null
            }
          >
            <div className="dust-document-blocks" hidden={!showBlocks}>
              <div className="dust-document-blocks-label">Add a block</div>
              <div
                className="dust-document-blocks-list"
                role="menu"
                aria-label="Add a block"
              >
                {blocks.map((block, index) => (
                  <button
                    key={block.name}
                    id={`${blocksMenuId}-${index}`}
                    type="button"
                    role="menuitem"
                    aria-label={block.name}
                    data-active={index === activeIndex}
                    onPointerMove={() => setHighlight({ queryKey, index })}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertBlock(index)}
                  >
                    <span className="dust-document-block-icon">
                      <block.icon size={20} aria-hidden="true" />
                    </span>
                    <span>
                      <span className="dust-document-block-name">
                        {block.name}
                      </span>
                      <span className="dust-document-block-description">
                        {block.description}
                      </span>
                    </span>
                    <CornerDownLeft
                      size={13}
                      className="dust-document-block-enter"
                      aria-hidden="true"
                    />
                  </button>
                ))}
                {blocks.length === 0 && (
                  <div className="dust-document-blocks-empty">
                    No matching blocks
                  </div>
                )}
              </div>
              <div className="dust-document-blocks-hint">
                <span>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd> Navigate
                </span>
                <span>
                  <kbd>↵</kbd> Insert
                </span>
                <span>
                  <kbd>esc</kbd> Close
                </span>
              </div>
            </div>
          </BubbleMenu>
        )}
        <EditorContent editor={editor} />
        <style>{DOCUMENT_STYLES}</style>
      </div>
    </article>
  );
}
