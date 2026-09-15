import { ToolBarContent } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarContent";
import { EditorSelectionToolbar } from "@app/components/editor/EditorSelectionToolbar";
import { HeadingExtension } from "@app/components/editor/extensions/HeadingExtension";
import { BlockquoteExtension } from "@app/components/editor/input_bar/BlockquoteExtension";
import { LinkExtension } from "@app/components/editor/input_bar/LinkExtension";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { cn, markdownStyles, Toolbar } from "@dust-tt/sparkle";
import type { Extensions } from "@tiptap/core";
import { generateHTML, generateJSON } from "@tiptap/html";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useMemo, useRef } from "react";

function buildHtmlEditorExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      paragraph: {
        HTMLAttributes: { class: markdownStyles.paragraph() },
      },
      orderedList: {
        HTMLAttributes: { class: markdownStyles.orderedList() },
      },
      listItem: {
        HTMLAttributes: { class: markdownStyles.list() },
      },
      link: false,
      bulletList: {
        HTMLAttributes: { class: markdownStyles.unorderedList() },
      },
      blockquote: false,
      horizontalRule: {
        HTMLAttributes: { class: "my-4 border-0 border-t border-border" },
      },
      strike: false,
      undoRedo: { depth: 100 },
      code: {
        HTMLAttributes: { class: markdownStyles.codeInline() },
      },
      codeBlock: {
        HTMLAttributes: { class: markdownStyles.codeBlock() },
      },
    }),
    HeadingExtension.configure({
      levels: [1, 2, 3, 4, 5, 6],
      HTMLAttributes: { class: "mt-4 mb-3" },
    }),
    BlockquoteExtension.configure({
      HTMLAttributes: { class: markdownStyles.blockquote() },
    }),
    LinkExtension.configure({
      HTMLAttributes: {
        class: "text-blue-600 hover:underline hover:text-blue-800",
      },
      autolink: false,
      openOnClick: false,
    }),
  ];
}

/**
 * Drop the Tailwind classes the editor schema attaches for on-screen styling.
 * They are ours, not the author's, and mean nothing to a mail client.
 */
function serializeEditorHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.body.querySelectorAll("[class]").forEach((element) => {
    element.removeAttribute("class");
  });
  return doc.body.innerHTML;
}

/** Every element and attribute in `html`, flattened for comparison. */
function contentsOf(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.body.querySelectorAll("*")).flatMap((element) => [
    element.tagName,
    ...Array.from(element.attributes, ({ name, value }) => `${name}=${value}`),
  ]);
}

/**
 * Whether the editor gives this body back whole.
 *
 * TipTap keeps only what its schema models, and drops the rest silently.
 */
export function canEditorRenderHtml(html: string): boolean {
  const extensions = buildHtmlEditorExtensions();
  const rendered = serializeEditorHtml(
    generateHTML(generateJSON(html, extensions), extensions)
  );

  const kept = new Set(contentsOf(rendered));
  return contentsOf(html).every((item) => kept.has(item));
}

interface HtmlEditorProps {
  className?: string;
  initialHtml: string;
  isReadOnly?: boolean;
  onChange: (html: string) => void;
}

export function HtmlEditor({
  className,
  initialHtml,
  isReadOnly = false,
  onChange,
}: HtmlEditorProps) {
  const isMobile = useIsMobile();

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const extensions = useMemo(() => buildHtmlEditorExtensions(), []);

  const editor = useEditor(
    {
      content: initialHtml,
      editable: !isReadOnly,
      extensions,
      immediatelyRender: false,
      editorProps: {
        attributes: { class: cn("min-h-24 outline-none", className) },
      },
      onUpdate: ({ editor: editorInstance }) => {
        onChangeRef.current(
          editorInstance.isEmpty
            ? ""
            : serializeEditorHtml(editorInstance.getHTML())
        );
      },
    },
    [extensions, isReadOnly]
  );

  return (
    <div className="relative">
      <EditorContent editor={editor} />
      {editor && !isReadOnly && (
        <EditorSelectionToolbar editor={editor} disabled={isMobile}>
          <Toolbar className="inline-flex">
            <ToolBarContent editor={editor} />
          </Toolbar>
        </EditorSelectionToolbar>
      )}
    </div>
  );
}
