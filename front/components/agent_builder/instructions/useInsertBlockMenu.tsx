import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BlockMenuItem } from "@app/components/agent_builder/instructions/InsertBlockMenu";
import { BLOCK_MENU_ITEMS } from "@app/components/agent_builder/instructions/InsertBlockMenu";

// Map menu item IDs to instruction block types
const BLOCK_TYPE_MAPPING: Record<string, string> = {
  "xml-block": "instructions",
  "code-block": "codeBlock",
  // Future mappings can be added here:
  // "heading": "heading",
  // "list": "list",
} as const;

interface InsertBlockMenuState {
  isOpen: boolean;
  query: string;
  items: BlockMenuItem[];
  selectedIndex: number;
  triggerRect: DOMRect | null;
  triggerPos: number;
}

export const useInsertBlockMenu = (editor: Editor | null) => {
  const [state, setState] = useState<InsertBlockMenuState>({
    isOpen: false,
    query: "",
    items: BLOCK_MENU_ITEMS,
    selectedIndex: 0,
    triggerRect: null,
    triggerPos: -1,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // Filter items based on query
  const filterItems = useCallback((query: string) => {
    if (!query) {
      return BLOCK_MENU_ITEMS;
    }

    const lowerQuery = query.toLowerCase();
    return BLOCK_MENU_ITEMS.filter((item) =>
      item.label.toLowerCase().includes(lowerQuery)
    );
  }, []);

  // Open the menu
  const openMenu = useCallback(
    (pos: number) => {
      if (!editor) {
        return;
      }

      const coords = editor.view.coordsAtPos(pos);

      // Create a simplified rect object with only the properties we need
      const triggerRect = {
        left: coords.left,
        right: coords.right,
        top: coords.top,
        bottom: coords.bottom,
        width: coords.right - coords.left,
        height: coords.bottom - coords.top,
        x: coords.left,
        y: coords.top,
      } as DOMRect;

      setState({
        isOpen: true,
        query: "",
        items: BLOCK_MENU_ITEMS,
        selectedIndex: 0,
        triggerRect,
        triggerPos: pos,
      });
    },
    [editor]
  );

  // Update query
  const updateQuery = useCallback(
    (query: string) => {
      const items = filterItems(query);
      setState((prev) => ({
        ...prev,
        query,
        items,
        selectedIndex: 0,
      }));
    },
    [filterItems]
  );

  // Close the menu
  const closeMenu = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
      triggerRect: null,
      triggerPos: -1,
    }));
  }, []);

  // Navigate up
  const navigateUp = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedIndex:
        prev.selectedIndex > 0 ? prev.selectedIndex - 1 : prev.items.length - 1,
    }));
  }, []);

  // Navigate down
  const navigateDown = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedIndex:
        prev.selectedIndex < prev.items.length - 1 ? prev.selectedIndex + 1 : 0,
    }));
  }, []);

  // Select an item
  const selectItem = useCallback(
    (item: BlockMenuItem) => {
      if (!editor || state.triggerPos === -1) {
        return;
      }

      const { state: editorState } = editor;
      const { selection } = editorState;

      // Delete the trigger character and query
      const deleteFrom = state.triggerPos;
      const deleteTo = selection.to;

      const chain = editor
        .chain()
        .focus()
        .deleteRange({ from: deleteFrom, to: deleteTo });

      // Handle different block types
      if (item.id === "code-block") {
        chain.setCodeBlock().run();
      } else {
        // Handle instruction blocks (XML Tag, etc.)
        const blockType = BLOCK_TYPE_MAPPING[item.id] ?? "instructions";
        chain.insertInstructionBlock(blockType).run();
      }

      closeMenu();
    },
    [editor, state.triggerPos, closeMenu]
  );

  // Select current item
  const selectCurrent = useCallback(() => {
    const currentItem = state.items[state.selectedIndex];
    if (currentItem) {
      selectItem(currentItem);
    }
  }, [state.items, state.selectedIndex, selectItem]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (event: KeyboardEvent): boolean => {
      if (!state.isOpen) {
        return false;
      }

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          navigateUp();
          return true;
        case "ArrowDown":
          event.preventDefault();
          navigateDown();
          return true;
        case "Enter":
          event.preventDefault();
          selectCurrent();
          return true;
        case "Escape":
          event.preventDefault();
          closeMenu();
          return true;
        default:
          return false;
      }
    },
    [state.isOpen, navigateUp, navigateDown, selectCurrent, closeMenu]
  );

  // Monitor editor for trigger characters
  useEffect(() => {
    if (!editor) {
      return;
    }

    const checkForTrigger = () => {
      const { state } = editor;
      const { selection } = state;
      const { from, to } = selection;

      if (from !== to) {
        closeMenu();
        return;
      }

      // Check for trigger pattern (/ or @ at start of line or after space)
      const textBefore = state.doc.textBetween(
        Math.max(0, from - 10),
        from,
        " "
      );

      const match = textBefore.match(/(?:^|\s)([/@])(\w*)$/);

      if (match) {
        const query = match[2];
        const triggerPos =
          from - match[0].length + (match[0].startsWith(" ") ? 1 : 0);

        if (!stateRef.current.isOpen) {
          openMenu(triggerPos);
        } else {
          updateQuery(query);
        }
      } else if (stateRef.current.isOpen) {
        closeMenu();
      }
    };

    const handleUpdate = () => {
      checkForTrigger();
    };

    editor.on("selectionUpdate", handleUpdate);
    editor.on("update", handleUpdate);

    return () => {
      editor.off("selectionUpdate", handleUpdate);
      editor.off("update", handleUpdate);
    };
  }, [editor, openMenu, updateQuery, closeMenu]);

  return {
    menuState: {
      isOpen: state.isOpen,
      triggerRect: state.triggerRect,
      items: state.items,
      selectedIndex: state.selectedIndex,
      onOpenChange: (open: boolean) => {
        if (!open) {
          closeMenu();
        }
      },
      onSelectedIndexChange: (index: number) => {
        setState((prev) => ({ ...prev, selectedIndex: index }));
      },
      onSelect: selectItem,
    },
    handleKeyDown,
  };
};
