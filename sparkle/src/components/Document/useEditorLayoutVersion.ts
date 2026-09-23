import type { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";

// Markers and the composer read highlight positions from the DOM. Put this counter in
// their layout effect deps and they measure again whenever the text may have moved:
// after a document edit, when the editor element resizes, or when the window does.

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
