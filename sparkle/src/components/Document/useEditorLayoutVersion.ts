import type { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";

/** Increments after each document change and when the editor's DOM resizes. */
export const useEditorLayoutVersion = (editor: Editor | null) => {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const bump = () => setVersion((value) => value + 1);
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(bump) : null;

    // Selection-only transactions follow every render, so only document changes count.
    editor.on("update", bump);
    observer?.observe(editor.view.dom);
    window.addEventListener("resize", bump);

    return () => {
      editor.off("update", bump);
      observer?.disconnect();
      window.removeEventListener("resize", bump);
    };
  }, [editor]);

  return version;
};
