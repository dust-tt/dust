import { Box, Text, useStdout } from "ink";
import type { FC, ReactNode } from "react";
import React, { useCallback } from "react";

import type { BaseItem } from "./Select.js";
import { Select } from "./Select.js";

interface FileAccessItem extends BaseItem {}

interface FileAccessSelectorProps {
  selectMultiple?: boolean;
  onConfirm: (selectedModelFileAccess: FileAccessItem[]) => void;
}

const FileAccessSelector: FC<FileAccessSelectorProps> = ({
  selectMultiple = false,
  onConfirm,
}) => {
  const { stdout } = useStdout();

  const allOptions = [
    { id: "y", label: "Yes" },
    { id: "n", label: "No" },
  ];

  const renderFileAccessItem = useCallback(
    (
      item: FileAccessItem,
      isSelected: boolean,
      isFocused: boolean
    ): ReactNode => {
      const descriptionIndent = 3;

      let truncatedDescription = "";

      const indicator = isFocused ? "> " : "  ";
      const selectionMark = isSelected ? "x" : " ";

      return (
        <Box key={item.id} flexDirection="column">
          {selectMultiple ? (
            <Text color={isFocused ? "blue" : undefined}>
              {`${indicator}[`}
              <Text bold={isSelected}>{selectionMark}</Text>
              {`] ${item.label} (${item.id})`}
            </Text>
          ) : (
            <Text color={isFocused ? "blue" : undefined}>
              {`${indicator} ${item.label} (${item.id})`}
            </Text>
          )}
          {truncatedDescription && (
            <Box marginLeft={descriptionIndent}>
              <Text dimColor>{truncatedDescription}</Text>
            </Box>
          )}
        </Box>
      );
    },
    [stdout?.columns, selectMultiple]
  );

  const renderSelectedModelFileAccessItem = useCallback(
    (item: FileAccessItem): ReactNode => {
      return <Text key={item.id}>- {item.label}</Text>;
    },
    []
  );

  const handleConfirm = useCallback(
    (selectedIds: string[]) => {
      const selectedModelFileAccess = allOptions.filter((options) =>
        selectedIds.includes(options.id)
      );

      onConfirm(selectedModelFileAccess);
    },
    [allOptions, onConfirm]
  );

  const fileAccessItems: FileAccessItem[] = allOptions.map((option) => ({
    id: option.id,
    label: option.label,
  }));

  return (
    <Select<FileAccessItem>
      enableSearch={false}
      selectMultiple={selectMultiple}
      items={fileAccessItems}
      onConfirm={handleConfirm}
      renderItem={renderFileAccessItem}
      renderSelectedItem={renderSelectedModelFileAccessItem}
      selectPrompt="Allow Agent Access to System Files?"
    />
  );
};

export default FileAccessSelector;
