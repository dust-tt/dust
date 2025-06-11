import { Box, Text } from "ink";
import React from "react";

import type { Command } from "../commands/types.js";
import { AVAILABLE_COMMANDS } from "../commands/types.js";

interface CommandSelectorProps {
  query: string;
  selectedIndex: number;
  onSelect: (command: Command) => void;
}

export function CommandSelector({ query, selectedIndex }: CommandSelectorProps) {
  // Filter commands based on the query
  const filteredCommands = AVAILABLE_COMMANDS.filter((command) =>
    command.name.toLowerCase().startsWith(query.toLowerCase())
  );

  if (filteredCommands.length === 0) {
    return (
      <Box flexDirection="column">
        <Box paddingX={1}>
          <Text dimColor>No commands found</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box paddingX={1} flexDirection="column">
        {filteredCommands.map((command, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box key={command.name} flexDirection="row">
              <Box width={15}>
                <Text
                  color={isSelected ? "blue" : undefined}
                  bold={isSelected}
                >
                  /{command.name}
                </Text>
              </Box>
              <Text dimColor={!isSelected} color={isSelected ? undefined : undefined}>
                {command.description}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}