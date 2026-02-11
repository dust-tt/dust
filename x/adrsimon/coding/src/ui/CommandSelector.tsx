import { Box, Text } from "ink";
import React from "react";

import type { Command } from "./commands/types.js";

interface CommandSelectorProps {
  query: string;
  selectedIndex: number;
  commands: Command[];
}

export function CommandSelector({
  query,
  selectedIndex,
  commands,
}: CommandSelectorProps) {
  const filteredCommands = commands.filter((command) =>
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
              <Text dimColor={!isSelected}>{command.description}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
