import React, { FC, ReactNode, useEffect, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";

export interface BaseItem {
  id: string;
  label: string; // Used for searching
}

interface MultiSelectWithSearchProps<T extends BaseItem> {
  items: T[];
  onConfirm: (selectedIds: string[]) => void;
  renderItem: (item: T, isSelected: boolean, isFocused: boolean) => ReactNode;
  renderSelectedItem?: (item: T) => ReactNode;
  itemLines?: number; // Lines per item for page size calculation
  legRoom?: number; // Extra lines for UI
  searchPrompt?: string;
  selectPrompt?: string;
}

const DEFAULT_ITEM_LINES = 4;
const DEFAULT_LEG_ROOM = 7;
const DEFAULT_SEARCH_PROMPT = "Search Items:";
const DEFAULT_SELECT_PROMPT = "Select Items";

export const MultiSelectWithSearch = <T extends BaseItem>({
  items,
  onConfirm,
  renderItem,
  renderSelectedItem = (item: T) => (
    <Text key={item.id}>
      - {item.label} ({item.id})
    </Text>
  ),
  itemLines = DEFAULT_ITEM_LINES,
  legRoom = DEFAULT_LEG_ROOM,
  searchPrompt = DEFAULT_SEARCH_PROMPT,
  selectPrompt = DEFAULT_SELECT_PROMPT,
}: MultiSelectWithSearchProps<T>) => {
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows || 24;

  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionOrder, setSelectionOrder] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  // Used to trigger re-render on "enter" press when the terminal size is too small.
  const [_forceRerenderKey, setForceRerenderKey] = useState(0);

  const selectedBlockHeight =
    selectionOrder.length > 0
      ? 1 + 1 + 2 + selectionOrder.length // marginTop + header + border + lines
      : 0;
  const baseAvailableHeight = Math.max(0, terminalHeight - legRoom);
  const listAvailableHeight = Math.max(
    0,
    baseAvailableHeight - selectedBlockHeight
  );
  const dynamicPageSize = Math.max(
    1,
    Math.floor(listAvailableHeight / itemLines)
  );

  const filteredItems = items.filter((item) =>
    item.label.toLowerCase().startsWith(searchQuery.toLowerCase())
  );

  const totalPages = Math.max(
    1,
    Math.ceil(filteredItems.length / dynamicPageSize)
  );
  const startIndex = currentPage * dynamicPageSize;
  const endIndex = startIndex + dynamicPageSize;
  const paginatedFilteredItems = filteredItems.slice(startIndex, endIndex);

  useEffect(() => {
    const newTotalPages = Math.max(
      1,
      Math.ceil(filteredItems.length / dynamicPageSize)
    );
    if (currentPage >= newTotalPages) {
      setCurrentPage(Math.max(0, newTotalPages - 1));
      setCursor(0);
    }
  }, [filteredItems.length, dynamicPageSize, currentPage]);

  useEffect(() => {
    setCursor(0);
    setCurrentPage(0);
  }, [searchQuery]);

  useInput(
    (input, key) => {
      if (terminalHeight < 30) {
        if (key.return) {
          setForceRerenderKey((k) => k + 1);
        }
        return;
      }

      const currentItem = paginatedFilteredItems[cursor];
      const currentItemId = currentItem?.id;

      if (key.upArrow) {
        setCursor((prev) =>
          prev > 0 ? prev - 1 : paginatedFilteredItems.length - 1
        );
      } else if (key.downArrow) {
        setCursor((prev) =>
          prev < paginatedFilteredItems.length - 1 ? prev + 1 : 0
        );
      } else if (key.leftArrow) {
        if (currentPage > 0) {
          setCurrentPage((prev) => prev - 1);
          setCursor(0);
        }
      } else if (key.rightArrow) {
        if (currentPage < totalPages - 1) {
          setCurrentPage((prev) => prev + 1);
          setCursor(0);
        }
      } else if (input === " ") {
        if (currentItemId) {
          setSelected((prevSelected) => {
            const newSelected = new Set(prevSelected);
            if (newSelected.has(currentItemId)) {
              newSelected.delete(currentItemId);
              setSelectionOrder((prevOrder) =>
                prevOrder.filter((id) => id !== currentItemId)
              );
            } else {
              newSelected.add(currentItemId);
              setSelectionOrder((prevOrder) => [...prevOrder, currentItemId]);
            }
            return newSelected;
          });
        }
      } else if (key.return) {
        if (paginatedFilteredItems.length > 0) {
          let finalSelectionOrder = selectionOrder;
          let finalSelected = selected;

          if (selected.size === 0 && currentItemId) {
            finalSelected = new Set([currentItemId]);
            finalSelectionOrder = [currentItemId];
          }

          if (finalSelected.size > 0) {
            onConfirm(finalSelectionOrder);
          }
        }
      } else if (key.escape) {
        if (selectionOrder.length > 0) {
          const lastSelectedId = selectionOrder[selectionOrder.length - 1];
          setSelectionOrder((prevOrder) => prevOrder.slice(0, -1));
          setSelected((prevSelected) => {
            const newSelected = new Set(prevSelected);
            newSelected.delete(lastSelectedId);
            return newSelected;
          });
        }
      } else if (key.backspace || key.delete) {
        setSearchQuery((prev) => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setSearchQuery((prev) => prev + input);
      }
    },
    { isActive: true }
  );

  if (terminalHeight < 30) {
    return (
      <Box>
        <Text color="red">
          Terminal height must be at least 25 lines. Resize and press Enter.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text>{searchPrompt} </Text>
        <Text color="cyan">{searchQuery}</Text>
        <Text color="gray">_</Text>
      </Box>
      {searchQuery !== "" && filteredItems.length > 0 && totalPages > 1 && (
        <Text>
          Use Up/Down to navigate, Left/Right for pages ({currentPage + 1} /{" "}
          {totalPages})
        </Text>
      )}
      <Box marginTop={1}>
        <Text bold>
          {selectPrompt} (Space to toggle, Enter to confirm, Esc to undo last
          selection)
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1} minHeight={5}>
        {searchQuery === "" ? (
          <Text color="gray">Type to search...</Text>
        ) : paginatedFilteredItems.length === 0 ? (
          <Text color="yellow">No matching items found.</Text>
        ) : (
          paginatedFilteredItems.map((item, index) => {
            const isSelected = selected.has(item.id);
            const isFocused = index === cursor;
            return (
              <Box key={item.id}>{renderItem(item, isSelected, isFocused)}</Box>
            );
          })
        )}
      </Box>

      {selectionOrder.length > 0 && (
        <Box
          flexDirection="column"
          marginTop={1}
          borderStyle="round"
          paddingX={1}
        >
          <Text bold>Selected:</Text>
          {selectionOrder.map((itemId) => {
            const item = items.find((i) => i.id === itemId);
            return item ? (
              renderSelectedItem(item)
            ) : (
              <Text key={itemId}>- {itemId} (Removed?)</Text>
            );
          })}
        </Box>
      )}

      {searchQuery !== "" && totalPages > 1 && (
        <Box marginTop={1} justifyContent="center">
          <Text dimColor>
            --- Page {currentPage + 1} of {totalPages} ---
          </Text>
        </Box>
      )}
    </Box>
  );
};
