import { Box, Text } from "ink";
import React from "react";

export interface InlineSelectorItem {
  id: string;
  label: string;
  description?: string;
}

interface InlineSelectorProps {
  items: InlineSelectorItem[];
  query: string;
  selectedIndex: number;
  maxVisible?: number;
  prompt?: string;
  header?: React.ReactNode;
}

export function InlineSelector({
  items,
  query,
  selectedIndex,
  maxVisible = 10,
  prompt,
  header,
}: InlineSelectorProps) {
  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  const visible = filtered.slice(0, maxVisible);
  const remaining = filtered.length - visible.length;

  return (
    <Box flexDirection="column">
      {header && <Box paddingX={1}>{header}</Box>}
      {prompt && (
        <Box paddingX={1}>
          <Text dimColor>{prompt}</Text>
        </Box>
      )}
      {visible.length === 0 ? (
        <Box paddingX={1}>
          <Text dimColor>No matches</Text>
        </Box>
      ) : (
        <Box paddingX={1} flexDirection="column">
          {visible.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <Box key={item.id} flexDirection="row">
                <Text color={isSelected ? "blue" : undefined} bold={isSelected}>
                  {isSelected ? "> " : "  "}
                  {item.label}
                </Text>
                {item.description && (
                  <Text dimColor>
                    {"  "}
                    {item.description}
                  </Text>
                )}
              </Box>
            );
          })}
          {remaining > 0 && (
            <Box>
              <Text dimColor> ({remaining} more)</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
