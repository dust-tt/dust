import { readdir } from "fs/promises";
import { Box, Text, useInput } from "ink";
import { dirname, join, resolve } from "path";
import type { FC } from "react";
import React, { useEffect, useState } from "react";

import {
  getFileExtension,
  isSupportedFileType,
} from "../../utils/fileHandling.js";

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isSupported?: boolean;
}

interface FileSelectorProps {
  // Accepts a single file path or an array of file paths for multi-select
  onSelect: (filePath: string | string[]) => void;
  onCancel: () => void;
  initialPath?: string;
}

export const FileSelector: FC<FileSelectorProps> = ({
  onSelect,
  onCancel,
  initialPath = process.cwd(),
}) => {
  const [currentPath, setCurrentPath] = useState(resolve(initialPath));
  const [items, setItems] = useState<FileItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [viewStart, setViewStart] = useState(0);
  const viewSize = 15;

  const loadDirectory = async (path: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const entries = await readdir(path, { withFileTypes: true });
      const fileItems: FileItem[] = [];

      // Add parent directory option (unless we're at root)
      if (path !== "/") {
        fileItems.push({
          name: "..",
          path: dirname(path),
          isDirectory: true,
        });
      }

      // Add directories first, then files
      const directories = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          name: entry.name,
          path: join(path, entry.name),
          isDirectory: true,
        }));

      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => {
          const extension = getFileExtension(entry.name);
          return {
            name: entry.name,
            path: join(path, entry.name),
            isDirectory: false,
            isSupported: isSupportedFileType(extension),
          };
        })
        .sort((a, b) => {
          // Sort supported files first
          if (a.isSupported && !b.isSupported) {
            return -1;
          }
          if (!a.isSupported && b.isSupported) {
            return 1;
          }
          return a.name.localeCompare(b.name);
        });

      setItems([
        ...directories.sort((a, b) => a.name.localeCompare(b.name)),
        ...files,
      ]);
      setSelectedIndex(0);
      setViewStart(0);
    } catch (err) {
      setError(
        `Cannot read directory: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDirectory(currentPath);
  }, [currentPath]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => {
        const next = Math.max(0, prev - 1);
        setViewStart((start) => (next < start ? next : start));
        return next;
      });
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => {
        const next = Math.min(items.length - 1, prev + 1);
        setViewStart((start) => (next >= start + viewSize ? start + 1 : start));
        return next;
      });
      return;
    }

    if (key.leftArrow) {
      // Go up one directory
      if (currentPath !== "/") {
        setCurrentPath(dirname(currentPath));
      }
      return;
    }

    if (key.rightArrow) {
      const selectedItem = items[selectedIndex];
      if (selectedItem && selectedItem.isDirectory) {
        setCurrentPath(selectedItem.path);
      }
      return;
    }

    if (key.return) {
      if (selectedFiles.size > 0) {
        // Return all selected files
        onSelect(Array.from(selectedFiles));
        return;
      }
      const selectedItem = items[selectedIndex];
      if (!selectedItem) {
        return;
      }
      if (selectedItem.isDirectory) {
        setCurrentPath(selectedItem.path);
      } else if (selectedItem.isSupported) {
        onSelect(selectedItem.path);
      }
      return;
    }

    if (key.shift) {
      const selectedItem = items[selectedIndex];
      if (!selectedItem || selectedItem.isDirectory) {
        return;
      }
      setSelectedFiles((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(selectedItem.path)) {
          newSet.delete(selectedItem.path);
        } else {
          newSet.add(selectedItem.path);
        }
        return newSet;
      });
      return;
    }

    // Quick navigation with letters
    if (input && input.length === 1) {
      const index = items.findIndex((item) =>
        item.name.toLowerCase().startsWith(input.toLowerCase())
      );
      if (index !== -1) {
        setSelectedIndex(index);
      }
    }
  });

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          Error
        </Text>
        <Text color="red">{error}</Text>
        <Text color="gray">Press ESC to cancel</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="blue">
        📁 Select a file to attach
      </Text>
      <Text color="gray">Current: {currentPath}</Text>

      {isLoading ? (
        <Text color="yellow">Loading...</Text>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {items.slice(viewStart, viewStart + viewSize).map((item, index) => {
            const actualIndex = viewStart + index;
            const isSelected = actualIndex === selectedIndex;
            const isChecked = !item.isDirectory && selectedFiles.has(item.path);
            let icon = "📄";
            let color = "white";

            if (item.isDirectory) {
              icon = item.name === ".." ? "⬆️ " : "📁";
              color = "blue";
            } else if (item.isSupported) {
              const ext = getFileExtension(item.name);
              if (
                [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"].includes(
                  ext
                )
              ) {
                icon = "🖼️ ";
                color = "yellow";
              } else {
                icon = "📄";
                color = "cyan";
              }
            } else {
              color = "gray";
            }

            return (
              <Box key={item.path}>
                <Text
                  color={isSelected ? "black" : color}
                  backgroundColor={isSelected ? "white" : undefined}
                  bold={isSelected}
                >
                  {isSelected ? "→ " : "  "}
                  {isChecked ? "✔ " : "  "}
                  {icon} {item.name}
                  {!item.isDirectory && !item.isSupported
                    ? " (unsupported)"
                    : ""}
                </Text>
              </Box>
            );
          })}

          {items.length > viewSize && (
            <Text color="gray">
              Showing {viewStart + 1}-
              {Math.min(viewStart + viewSize, items.length)} of {items.length}{" "}
              items
            </Text>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">
          ↑↓ navigate • ← up dir • → enter dir • Space select • Enter confirm •
          ESC cancel • Type to jump
        </Text>
      </Box>
    </Box>
  );
};
