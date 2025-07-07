import { Box, Text } from "ink";
import React from "react";

import { useTabManager } from "./TabManager.js";

export const TabBar: React.FC = () => {
  const { tabs, activeTabId } = useTabManager();

  if (tabs.length <= 1) {
    return null;
  }

  return (
    <Box flexDirection="row" borderStyle="single" borderBottom={true} paddingX={1}>
      {tabs.map((tab, index) => (
        <Box key={tab.id} marginRight={1}>
          <Text
            color={tab.id === activeTabId ? "blue" : "gray"}
            bold={tab.id === activeTabId}
            dimColor={tab.id !== activeTabId}
          >
            {index + 1}. {tab.title}
            {tab.isProcessingQuestion && " ●"}
          </Text>
        </Box>
      ))}
      <Box marginLeft={2}>
        <Text dimColor>
          Use Ctrl+W to close tab
        </Text>
      </Box>
    </Box>
  );
};