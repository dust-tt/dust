import { cn } from "@dust-tt/sparkle";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { defaultMarkdownParser } from "prosemirror-markdown";
import { useEffect } from "react";

import { createMarkdownSerializer } from "@app/components/assistant/conversation/input_bar/editor/markdownSerializer";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write your content in markdown...",
}: MarkdownEditorProps) {
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
      // Serialize to markdown using shared serializer
      const serializer = createMarkdownSerializer(editor.schema);
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

  // Update editor content when value changes externally
  useEffect(() => {
    if (!editor?.schema) {
      return;
    }

    const serializer = createMarkdownSerializer(editor.schema);
    const currentMarkdown = serializer.serialize(editor.state.doc);

    if (value !== currentMarkdown) {
      // Parse markdown directly to ProseMirror document
      const doc = defaultMarkdownParser.parse(value);
      if (doc) {
        editor.commands.setContent(doc.toJSON());
      }
    }
  }, [value, editor]);

  return (
    <div className="border-structure-200 bg-structure-50 dark:bg-structure-700 dark:border-structure-600 rounded border">
      <EditorContent editor={editor} />
    </div>
  );
}
