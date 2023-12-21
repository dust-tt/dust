import { Editor, EditorContent } from "@tiptap/react";

interface InputBarEditorContentProps {
  editor: Editor | null;
  className: string;
}

export default function InputBarEditorContent({
  editor,
  className,
}: InputBarEditorContentProps) {
  return <EditorContent editor={editor} className={className} />;
}
