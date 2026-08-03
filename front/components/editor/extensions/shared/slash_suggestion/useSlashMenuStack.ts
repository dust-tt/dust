import {
  getActiveSlashSubMenuFrame,
  popSlashSubMenu,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import type { Editor, Range } from "@tiptap/core";
import { useCallback, useEffect, useReducer } from "react";

type SlashMenuStorageExtensionName = "inputBarSlashSuggestion" | "slashCommand";

export function useSlashMenuStack(
  editor: Editor,
  extensionName: SlashMenuStorageExtensionName
) {
  const [, rerender] = useReducer((version: number) => version + 1, 0);

  const storage = editor.storage[extensionName];
  const activeFrame = getActiveSlashSubMenuFrame(storage);

  useEffect(() => {
    const onTransaction = () => {
      rerender();
    };

    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
    };
  }, [editor]);

  const pop = useCallback(
    (range: Range) => {
      popSlashSubMenu({ editor, range, storage });
      rerender();
    },
    [editor, storage]
  );

  return {
    activeFrame,
    pop,
    rerender,
    storage,
  };
}
