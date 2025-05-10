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
  const terminalWidth = stdout?.columns || 80;

  // Constants for minimum terminal dimensions
  const MIN_TERMINAL_HEIGHT = 15;
  const MIN_TERMINAL_WIDTH = 60;

  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionOrder, setSelectionOrder] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  // Used to trigger re-render on "enter" press when the terminal size is too small.
  const [_forceRerenderKey, setForceRerenderKey] = useState(0);

  // Use a fixed approach rather than dynamic to prevent UI jumping
  // This gives us a stable layout regardless of content changes
  const fixedListHeight = Math.max(
    3,
    Math.floor((terminalHeight - legRoom - 3) / 2)
  );
  const dynamicPageSize = Math.max(1, Math.floor(fixedListHeight / itemLines));

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
      // Get current terminal dimensions (may have changed since render)
      const currentWidth = stdout?.columns || 80;
      const currentHeight = stdout?.rows || 24;
      if (
        currentHeight < MIN_TERMINAL_HEIGHT ||
        currentWidth < MIN_TERMINAL_WIDTH
      ) {
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

  if (
    terminalHeight < MIN_TERMINAL_HEIGHT ||
    terminalWidth < MIN_TERMINAL_WIDTH
  ) {
    return (
      <Box>
        <Text color="red">
          Terminal size too small. Required: {MIN_TERMINAL_WIDTH}x
          {MIN_TERMINAL_HEIGHT}. Current: {terminalWidth}x{terminalHeight}.
          Resize and press Enter.
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
        {searchQuery !== "" && filteredItems.length > 0 && totalPages > 1 && (
          <Text color="gray">
            {" "}
            ({filteredItems.length} results, {totalPages} pages)
          </Text>
        )}
      </Box>
      <Box>
        <Text dimColor>
          {selectPrompt} (↑↓: Navigate, ←→: Pages, Space: Select, Enter:
          Confirm)
        </Text>
      </Box>
      <Box flexDirection="column" height={fixedListHeight} marginTop={1}>
        {searchQuery === "" ? (
          <Text color="gray">Type to search...</Text>
        ) : paginatedFilteredItems.length === 0 ? (
          <Text color="yellow">No matching items found.</Text>
        ) : (
          // Render a fixed number of items regardless of actual content
          Array.from({ length: dynamicPageSize }).map((_, index) => {
            if (index < paginatedFilteredItems.length) {
              const item = paginatedFilteredItems[index];
              const isSelected = selected.has(item.id);
              const isFocused = index === cursor;
              return (
                <Box key={`item-${index}-${currentPage}`}>
                  {renderItem(item, isSelected, isFocused)}
                </Box>
              );
            } else {
              // Render empty placeholder rows to maintain stable height
              return <Box key={`empty-${index}`} height={itemLines}></Box>;
            }
          })
        )}
      </Box>

      <Box flexDirection="column" marginTop={1} height={3}>
        {selectionOrder.length > 0 ? (
          <>
            <Text bold>Selected:</Text>
            <Box marginLeft={1} flexDirection="row" flexWrap="wrap">
              {selectionOrder.map((itemId) => {
                const item = items.find((i) => i.id === itemId);

                return (
                  <Box key={itemId} marginRight={2}>
                    <Text>{item ? renderSelectedItem(item) : itemId}</Text>
                  </Box>
                );
              })}
            </Box>
          </>
        ) : (
          // Empty placeholder to maintain consistent layout
          <Box></Box>
        )}
      </Box>

      <Box height={2} justifyContent="center" marginTop={1}>
        {searchQuery !== "" && totalPages > 1 ? (
          <Text>
            Page {currentPage + 1}/{totalPages} (←→ to change)
          </Text>
        ) : (
          // Empty placeholder to maintain consistent layout
          <Box></Box>
        )}
      </Box>
    </Box>
  );
};
