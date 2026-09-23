import type { Editor } from "@tiptap/core";
import { type RefObject, useEffect, useState } from "react";

// Markers and the composer read highlight positions from the DOM. Put this counter in
// their layout effect deps and they measure again whenever the text may have moved:
// after a document edit, when the editor or its container resizes, or when the window does.
// The container catches things like the save error banner appearing above the editor.
export const useEditorLayoutVersion = (
  editor: Editor | null,
  containerRef: RefObject<HTMLElement>
) => {
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
    if (containerRef.current) {
      observer?.observe(containerRef.current);
    }
    window.addEventListener("resize", bump);

    return () => {
      editor.off("update", bump);
      observer?.disconnect();
      window.removeEventListener("resize", bump);
    };
  }, [editor, containerRef]);

  return version;
};
