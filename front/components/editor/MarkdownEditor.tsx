import { ToolBarContent } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarContent";
import { cleanupPastedHTML } from "@app/components/editor/input_bar/cleanupPastedHTML";
import { buildMarkdownEditorExtensions } from "@app/lib/editor/build_markdown_editor_extensions";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { cn, Toolbar } from "@dust-tt/sparkle";
import type { Editor as CoreEditor, Extensions } from "@tiptap/core";
import type { Editor, EditorOptions } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { cva } from "class-variance-authority";
import debounce from "lodash/debounce";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";

export const DEFAULT_MARKDOWN_EDITOR_DEBOUNCE_MS = 250;
/** Default classes for the TipTap editable surface (scroll + max height). */
export const DEFAULT_MARKDOWN_EDITOR_CLASSNAME = "max-h-96";

const editorVariants = cva(
  [
    "overflow-auto p-2 resize-y min-h-60",
    "rounded-xl border transition-all duration-200",
    "bg-muted-background dark:bg-muted-background-night",
    "focus-within:ring-highlight-300 dark:focus-within:ring-highlight-300-night",
    "focus-within:outline-highlight-200 dark:focus-within:outline-highlight-200-night",
    "focus-within:border-highlight-300 dark:focus-within:border-highlight-300-night",
  ],
  {
    variants: {
      error: {
        true: [
          "border-warning-500 dark:border-warning-500-night",
          "focus-within:ring-warning-500 dark:focus-within:ring-warning-500-night",
          "focus-within:outline-warning-500 dark:focus-within:outline-warning-500-night",
          "focus-within:border-warning-500 dark:focus-within:border-warning-500-night",
        ],
        false: ["border-border dark:border-border-night"],
      },
    },
    defaultVariants: {
      error: false,
    },
  }
);

function useEditorService(editor: Editor | null) {
  return useMemo(
    () => ({
      getMarkdown() {
        return editor?.getMarkdown() ?? "";
      },

      setContent(content: string) {
        if (editor && !editor.isDestroyed) {
          editor.commands.setContent(content, {
            emitUpdate: false,
            contentType: "markdown",
          });
        }
      },

      focusEnd() {
        editor?.commands.focus("end");
      },

      isFocused() {
        return editor?.isFocused ?? false;
      },

      isDestroyed() {
        return editor?.isDestroyed ?? true;
      },
    }),
    [editor]
  );
}

export type MarkdownEditorService = ReturnType<typeof useEditorService>;

interface UseMarkdownEditorProps {
  content: string;
  debounceMs?: number;
  editable?: boolean;
  maxCharacterCount?: number;
  onBlur?: EditorOptions["onBlur"];
  onChange?: (markdown: string) => void;
  placeholder?: string;
}

export function useMarkdownEditor({
  content,
  debounceMs = DEFAULT_MARKDOWN_EDITOR_DEBOUNCE_MS,
  editable = true,
  maxCharacterCount,
  onBlur,
  onChange,
  placeholder,
}: UseMarkdownEditorProps) {
  const initialContentSetRef = useRef(false);
  const editorRef = useRef<Editor | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;

  const extensions = useMemo(
    (): Extensions =>
      buildMarkdownEditorExtensions({
        placeholder,
        maxCharacterCount,
      }),
    [maxCharacterCount, placeholder]
  );

  const debouncedUpdate = useMemo(
    () =>
      debounce((editorInstance: CoreEditor | Editor) => {
        if (!editorInstance.isDestroyed) {
          onChange?.(editorInstance.getMarkdown());
        }
      }, debounceMs),
    [debounceMs, onChange]
  );

  const editor = useEditor(
    {
      extensions,
      contentType: "markdown",
      editable,
      immediatelyRender: false,
      onUpdate: ({ editor: editorInstance, transaction }) => {
        if (transaction.docChanged) {
          debouncedUpdate(editorInstance);
        }
      },
      onBlur,
      editorProps: {
        transformPastedHTML(html: string) {
          return cleanupPastedHTML(html);
        },
      },
    },
    [extensions, editable]
  );

  const editorService = useEditorService(editor);

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }

    if (initialContentSetRef.current && editorRef.current === editor) {
      return;
    }

    editorRef.current = editor;
    initialContentSetRef.current = true;

    requestAnimationFrame(() => {
      if (!editor || editor.isDestroyed) {
        return;
      }

      editor.commands.setContent(contentRef.current, {
        emitUpdate: false,
        contentType: "markdown",
      });
    });
  }, [editor]);

  useEffect(() => {
    return () => {
      debouncedUpdate.cancel();
    };
  }, [debouncedUpdate]);

  useEffect(() => {
    if (
      !editor ||
      editor.isDestroyed ||
      !initialContentSetRef.current ||
      editor.isFocused
    ) {
      return;
    }

    const currentContent = editor.getMarkdown();
    if (currentContent !== content) {
      requestAnimationFrame(() => {
        if (editor && !editor.isDestroyed) {
          editor.commands.setContent(content, {
            emitUpdate: false,
            contentType: "markdown",
          });
        }
      });
    }
  }, [editor, content]);

  return { editor, editorService };
}

interface CharacterCountDisplayProps {
  count: number;
  maxCount: number;
}

function CharacterCountDisplay({
  count,
  maxCount,
}: CharacterCountDisplayProps) {
  if (count <= maxCount / 2) {
    return null;
  }

  const isOverLimit = count >= maxCount;

  return (
    <span
      className={cn(
        "text-end text-xs",
        isOverLimit
          ? "text-warning"
          : "text-muted-foreground dark:text-muted-foreground-night"
      )}
    >
      {count} / {maxCount} characters
    </span>
  );
}

export interface MarkdownEditorProps {
  value: string;
  onChange?: (markdown: string) => void;
  onBlur?: EditorOptions["onBlur"];
  placeholder?: string;
  readOnly?: boolean;
  maxCharacterCount?: number;
  /** When true, show the floating formatting toolbar on text selection. */
  showFormattingMenu?: boolean;
  showCharacterCount?: boolean;
  debounceMs?: number;
  toolbarExtra?: ReactNode;
  className?: string;
  /** Classes applied to the TipTap editable surface. Defaults to {@link DEFAULT_MARKDOWN_EDITOR_CLASSNAME}. */
  editorClassName?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  readOnly = false,
  maxCharacterCount,
  showFormattingMenu,
  showCharacterCount,
  debounceMs,
  toolbarExtra,
  className,
  editorClassName,
}: MarkdownEditorProps) {
  const isMobile = useIsMobile();
  const { editor } = useMarkdownEditor({
    content: value,
    onChange,
    onBlur,
    placeholder,
    editable: !readOnly,
    maxCharacterCount,
    debounceMs,
  });

  const shouldShowFormattingMenu = showFormattingMenu ?? !readOnly;
  const currentCharacterCount =
    editor?.storage.characterCount?.characters?.() ?? 0;
  const displayError =
    maxCharacterCount !== undefined &&
    currentCharacterCount >= maxCharacterCount;
  const shouldShowCharacterCount =
    (showCharacterCount ?? maxCharacterCount !== undefined) &&
    maxCharacterCount !== undefined;

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setOptions({
      editorProps: {
        attributes: {
          class: cn(
            editorVariants({ error: displayError }),
            DEFAULT_MARKDOWN_EDITOR_CLASSNAME,
            editorClassName
          ),
        },
        transformPastedHTML(html: string) {
          return cleanupPastedHTML(html);
        },
      },
    });
  }, [editor, displayError, editorClassName]);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="relative">
        <EditorContent editor={editor} />
        {shouldShowFormattingMenu && editor ? (
          <BubbleMenu
            editor={editor}
            className={cn("flex", isMobile && "hidden")}
          >
            <Toolbar className={cn("inline-flex", isMobile && "hidden")}>
              <ToolBarContent editor={editor} />
              {toolbarExtra}
            </Toolbar>
          </BubbleMenu>
        ) : null}
      </div>
      {shouldShowCharacterCount && editor ? (
        <CharacterCountDisplay
          count={currentCharacterCount}
          maxCount={maxCharacterCount}
        />
      ) : null}
    </div>
  );
}
