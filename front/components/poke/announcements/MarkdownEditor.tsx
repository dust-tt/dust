import { cn } from "@dust-tt/sparkle";
import Placeholder from "@tiptap/extension-placeholder";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import type { MarkdownSerializerState } from "prosemirror-markdown";
import { MarkdownSerializer } from "prosemirror-markdown";
import { useEffect, useMemo } from "react";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// Create a custom markdown serializer that supports all StarterKit features
// Tiptap uses camelCase node names (bulletList, codeBlock, etc.)
const createMarkdownSerializer = () => {
  return new MarkdownSerializer(
    {
      // Nodes - using camelCase as per Tiptap convention
      doc(state: MarkdownSerializerState, node: ProseMirrorNode) {
        state.renderContent(node);
      },
      paragraph(state: MarkdownSerializerState, node: ProseMirrorNode) {
        state.renderInline(node);
        state.closeBlock(node);
      },
      heading(state: MarkdownSerializerState, node: ProseMirrorNode) {
        state.write("#".repeat(node.attrs.level) + " ");
        state.renderInline(node);
        state.closeBlock(node);
      },
      codeBlock(state: MarkdownSerializerState, node: ProseMirrorNode) {
        state.write("```" + (node.attrs.language || "") + "\n");
        state.text(node.textContent, false);
        state.ensureNewLine();
        state.write("```");
        state.closeBlock(node);
      },
      blockquote(state: MarkdownSerializerState, node: ProseMirrorNode) {
        state.wrapBlock("> ", null, node, () => state.renderContent(node));
      },
      horizontalRule(state: MarkdownSerializerState) {
        state.write("\n---\n");
        state.closeBlock({} as any);
      },
      bulletList(state: MarkdownSerializerState, node: ProseMirrorNode) {
        state.renderList(node, "  ", () => "* ");
      },
      orderedList(state: MarkdownSerializerState, node: ProseMirrorNode) {
        const start = node.attrs.order || 1;
        state.renderList(node, "  ", (i) => `${start + i}. `);
      },
      listItem(state: MarkdownSerializerState, node: ProseMirrorNode) {
        state.renderContent(node);
      },
      hardBreak(state: MarkdownSerializerState) {
        state.write("  \n");
      },
      text(state: MarkdownSerializerState, node: ProseMirrorNode) {
        state.text(node.text || "");
      },
    },
    {
      // Marks - Tiptap uses these exact names
      bold: {
        open: "**",
        close: "**",
        mixable: true,
        expelEnclosingWhitespace: true,
      },
      italic: {
        open: "*",
        close: "*",
        mixable: true,
        expelEnclosingWhitespace: true,
      },
      code: {
        open: "`",
        close: "`",
        escape: false,
      },
      strike: {
        open: "~~",
        close: "~~",
        mixable: true,
        expelEnclosingWhitespace: true,
      },
      link: {
        open: "[",
        close(state: MarkdownSerializerState, mark: any) {
          return (
            "](" +
            mark.attrs.href +
            (mark.attrs.title ? ` "${mark.attrs.title}"` : "") +
            ")"
          );
        },
      },
    }
  );
};

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write your content in markdown...",
}: MarkdownEditorProps) {
  const serializer = useMemo(() => createMarkdownSerializer(), []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyNodeClass:
          "first:before:text-gray-400 first:before:italic first:before:content-[attr(data-placeholder)] first:before:pointer-events-none first:before:absolute",
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      // Serialize to markdown using custom serializer
      const markdown = serializer.serialize(editor.state.doc);
      onChange(markdown);
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none dark:prose-invert",
          "min-h-[400px] p-4",
          "focus:outline-none",
          "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2",
          "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2",
          "[&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1",
          "[&_strong]:font-bold",
          "[&_em]:italic",
          "[&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono",
          "[&_pre]:bg-gray-100 [&_pre]:p-4 [&_pre]:rounded [&_pre]:overflow-x-auto",
          "[&_ul]:list-disc [&_ul]:ml-6 [&_ul]:my-2",
          "[&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:my-2",
          "[&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-2"
        ),
      },
    },
  });

  // Parse markdown to HTML for initial load
  const parseMarkdownToHTML = (markdown: string): string => {
    let html = markdown;

    // Code blocks (must be before inline code)
    html = html.replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      "<pre><code>$2</code></pre>"
    );

    // Headers (must be before bold/italic to avoid conflicts)
    html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
    html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
    html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
    html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

    // Horizontal rules
    html = html.replace(/^---$/gm, "<hr>");
    html = html.replace(/^\*\*\*$/gm, "<hr>");

    // Blockquotes
    html = html.replace(/^>\s+(.+)$/gm, "<blockquote>$1</blockquote>");

    // Bold (before italic to handle ** before *)
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");

    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");

    // Italic (after bold)
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/_(.+?)_/g, "<em>$1</em>");

    // Inline code (after bold/italic)
    html = html.replace(/`(.+?)`/g, "<code>$1</code>");

    // Links
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

    // Process lists - handle both ordered and unordered
    const lines = html.split("\n");
    const processed: string[] = [];
    let inList = false;
    let listType = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ulMatch = line.match(/^[\*\-\+]\s+(.+)$/);
      const olMatch = line.match(/^\d+\.\s+(.+)$/);

      if (ulMatch) {
        if (!inList || listType !== "ul") {
          if (inList) {processed.push(`</${listType}>`);}
          processed.push("<ul>");
          inList = true;
          listType = "ul";
        }
        processed.push(`<li>${ulMatch[1]}</li>`);
      } else if (olMatch) {
        if (!inList || listType !== "ol") {
          if (inList) {processed.push(`</${listType}>`);}
          processed.push("<ol>");
          inList = true;
          listType = "ol";
        }
        processed.push(`<li>${olMatch[1]}</li>`);
      } else {
        if (inList) {
          processed.push(`</${listType}>`);
          inList = false;
          listType = "";
        }
        processed.push(line);
      }
    }
    if (inList) {
      processed.push(`</${listType}>`);
    }

    html = processed.join("\n");

    // Convert remaining double newlines to paragraphs (skip already formatted HTML)
    html = html
      .split("\n\n")
      .map((block) => {
        block = block.trim();
        if (!block) {return "";}
        // Don't wrap if it's already an HTML tag
        if (
          block.startsWith("<h") ||
          block.startsWith("<ul") ||
          block.startsWith("<ol") ||
          block.startsWith("<blockquote") ||
          block.startsWith("<pre") ||
          block.startsWith("<hr")
        ) {
          return block;
        }
        return `<p>${block.replace(/\n/g, "<br>")}</p>`;
      })
      .filter(Boolean)
      .join("\n");

    return html;
  };

  // Update editor content when value changes externally
  useEffect(() => {
    if (editor && value !== serializer.serialize(editor.state.doc)) {
      // Parse markdown to HTML before setting content
      const html = parseMarkdownToHTML(value);
      editor.commands.setContent(html);
    }
  }, [value, editor, serializer]);

  return (
    <div className="border-structure-200 bg-structure-50 dark:bg-structure-700 dark:border-structure-600 rounded border">
      <EditorContent editor={editor} />
    </div>
  );
}
