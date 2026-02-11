import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

import type { Command } from "./commands/types.js";
import { CommandSelector } from "./CommandSelector.js";

interface InputBoxProps {
  onSubmit: (text: string) => void;
  onCommandSelect: (command: Command) => void;
  commands: Command[];
  placeholder?: string;
  disabled?: boolean;
}

export function InputBox({
  onSubmit,
  onCommandSelect,
  commands,
  placeholder = "Type a message...",
  disabled = false,
}: InputBoxProps) {
  const [value, setValue] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);

  // Command mode state.
  const [showCommandSelector, setShowCommandSelector] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  const getFilteredCommands = () =>
    commands.filter((cmd) =>
      cmd.name.toLowerCase().startsWith(commandQuery.toLowerCase())
    );

  const exitCommandMode = () => {
    setShowCommandSelector(false);
    setCommandQuery("");
    setSelectedCommandIndex(0);
  };

  useInput(
    (input, key) => {
      if (disabled) return;

      // --- Command mode handling ---
      if (showCommandSelector) {
        if (key.escape) {
          exitCommandMode();
          return;
        }

        if (key.upArrow) {
          setSelectedCommandIndex((prev) => Math.max(0, prev - 1));
          return;
        }

        if (key.downArrow) {
          const filtered = getFilteredCommands();
          setSelectedCommandIndex((prev) =>
            Math.min(filtered.length - 1, prev + 1)
          );
          return;
        }

        if (key.return) {
          const filtered = getFilteredCommands();
          if (filtered.length > 0 && selectedCommandIndex < filtered.length) {
            const selected = filtered[selectedCommandIndex];
            exitCommandMode();
            setValue("");
            setCursorPosition(0);
            onCommandSelect(selected);
          }
          return;
        }

        if (key.backspace || key.delete) {
          if (commandQuery.length > 0) {
            setCommandQuery((prev) => prev.slice(0, -1));
            setSelectedCommandIndex(0);
          } else {
            exitCommandMode();
          }
          return;
        }

        // Regular character → append to command query.
        if (!key.ctrl && !key.meta && input && input.length === 1) {
          setCommandQuery((prev) => prev + input);
          setSelectedCommandIndex(0);
        }
        return;
      }

      // --- Normal input mode ---

      // Enter command mode when "/" is typed on empty input.
      if (
        input === "/" &&
        value === "" &&
        cursorPosition === 0 &&
        !key.ctrl &&
        !key.meta
      ) {
        setShowCommandSelector(true);
        setCommandQuery("");
        setSelectedCommandIndex(0);
        return;
      }

      if (key.return) {
        // Backslash before Enter → insert newline.
        if (cursorPosition > 0 && value[cursorPosition - 1] === "\\") {
          const newValue =
            value.slice(0, cursorPosition - 1) +
            "\n" +
            value.slice(cursorPosition);
          setValue(newValue);
          return;
        }

        if (value.trim()) {
          onSubmit(value.trim());
          setValue("");
          setCursorPosition(0);
        }
        return;
      }

      if (key.backspace || key.delete) {
        if (cursorPosition > 0) {
          setValue(
            value.slice(0, cursorPosition - 1) + value.slice(cursorPosition)
          );
          setCursorPosition(cursorPosition - 1);
        }
        return;
      }

      if (key.ctrl && input === "c") {
        process.exit(0);
      }

      if (key.ctrl && input === "u") {
        setValue("");
        setCursorPosition(0);
        return;
      }

      // Ctrl+A → beginning of current line.
      if (key.ctrl && input === "a") {
        let newPos = cursorPosition;
        while (newPos > 0 && value[newPos - 1] !== "\n") {
          newPos--;
        }
        setCursorPosition(newPos);
        return;
      }

      // Ctrl+E → end of current line.
      if (key.ctrl && input === "e") {
        let newPos = cursorPosition;
        while (newPos < value.length && value[newPos] !== "\n") {
          newPos++;
        }
        setCursorPosition(newPos);
        return;
      }

      // Option+Left (meta+b) → previous word.
      if (key.meta && input === "b" && cursorPosition > 0) {
        let newPos = cursorPosition - 1;
        while (newPos > 0 && /\s/.test(value[newPos])) {
          newPos--;
        }
        while (newPos > 0 && !/\s/.test(value[newPos - 1])) {
          newPos--;
        }
        setCursorPosition(newPos);
        return;
      }

      // Option+Right (meta+f) → next word.
      if (key.meta && input === "f" && cursorPosition < value.length) {
        let newPos = cursorPosition;
        if (/\s/.test(value[newPos])) {
          while (
            newPos < value.length &&
            /\s/.test(value[newPos]) &&
            value[newPos] !== "\n"
          ) {
            newPos++;
          }
          if (value[newPos] === "\n") {
            setCursorPosition(newPos);
            return;
          }
        } else {
          while (newPos < value.length && !/\s/.test(value[newPos])) {
            newPos++;
          }
          while (
            newPos < value.length &&
            /\s/.test(value[newPos]) &&
            value[newPos] !== "\n"
          ) {
            newPos++;
          }
        }
        setCursorPosition(newPos);
        return;
      }

      // Left arrow.
      if (key.leftArrow && cursorPosition > 0) {
        setCursorPosition(cursorPosition - 1);
        return;
      }

      // Right arrow.
      if (key.rightArrow && cursorPosition < value.length) {
        setCursorPosition(cursorPosition + 1);
        return;
      }

      // Up arrow → move to previous line.
      if (key.upArrow) {
        const lines = value.split("\n");
        let pos = 0;
        let lineIndex = 0;
        let posInLine = 0;

        for (let i = 0; i < lines.length; i++) {
          if (
            cursorPosition >= pos &&
            cursorPosition <= pos + lines[i].length
          ) {
            lineIndex = i;
            posInLine = cursorPosition - pos;
            break;
          }
          pos += lines[i].length + 1;
        }

        if (lineIndex > 0) {
          const prevLineLength = lines[lineIndex - 1].length;
          const newPosInLine = Math.min(posInLine, prevLineLength);
          let newCursorPos = 0;
          for (let i = 0; i < lineIndex - 1; i++) {
            newCursorPos += lines[i].length + 1;
          }
          newCursorPos += newPosInLine;
          setCursorPosition(newCursorPos);
        } else {
          setCursorPosition(0);
        }
        return;
      }

      // Down arrow → move to next line.
      if (key.downArrow) {
        const lines = value.split("\n");
        let pos = 0;
        let lineIndex = 0;
        let posInLine = 0;

        for (let i = 0; i < lines.length; i++) {
          if (
            cursorPosition >= pos &&
            cursorPosition <= pos + lines[i].length
          ) {
            lineIndex = i;
            posInLine = cursorPosition - pos;
            break;
          }
          pos += lines[i].length + 1;
        }

        if (lineIndex < lines.length - 1) {
          const nextLineLength = lines[lineIndex + 1].length;
          const newPosInLine = Math.min(posInLine, nextLineLength);
          let newCursorPos = 0;
          for (let i = 0; i <= lineIndex; i++) {
            newCursorPos += lines[i].length + 1;
          }
          newCursorPos += newPosInLine;
          setCursorPosition(newCursorPos);
        } else {
          setCursorPosition(value.length);
        }
        return;
      }

      // Regular character input.
      if (!key.ctrl && !key.meta && input) {
        if (input.length > 1) {
          // Paste support.
          const normalized = input.replace(/\r/g, "\n");
          const newValue =
            value.slice(0, cursorPosition) +
            normalized +
            value.slice(cursorPosition);
          setValue(newValue);
          setCursorPosition(cursorPosition + normalized.length);
        } else {
          const newValue =
            value.slice(0, cursorPosition) +
            input +
            value.slice(cursorPosition);
          setValue(newValue);
          setCursorPosition(cursorPosition + 1);
        }
      }
    },
    { isActive: !disabled }
  );

  // Compute display text and cursor position.
  const displayValue = showCommandSelector ? `/${commandQuery}` : value;
  const displayCursorPosition = showCommandSelector
    ? commandQuery.length + 1
    : cursorPosition;

  const lines = displayValue.split("\n");
  let currentPos = 0;
  let cursorLine = 0;
  let cursorPosInLine = 0;

  for (let i = 0; i < lines.length; i++) {
    if (
      displayCursorPosition >= currentPos &&
      displayCursorPosition <= currentPos + lines[i].length
    ) {
      cursorLine = i;
      cursorPosInLine = displayCursorPosition - currentPos;
      break;
    }
    currentPos += lines[i].length + 1;
  }

  return (
    <Box flexDirection="column">
      {/* Command selector dropdown */}
      {showCommandSelector && !disabled && (
        <CommandSelector
          query={commandQuery}
          selectedIndex={selectedCommandIndex}
          commands={commands}
        />
      )}

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={disabled ? "gray" : "blue"}
        paddingLeft={1}
        paddingRight={1}
      >
        {displayValue ? (
          lines.map((line, index) => (
            <Box key={index}>
              {index === 0 && (
                <Text color="blue" bold>
                  {">"}{" "}
                </Text>
              )}
              {index !== 0 && <Text>{"  "}</Text>}
              {!disabled && index === cursorLine ? (
                <>
                  <Text>{line.substring(0, cursorPosInLine)}</Text>
                  <Text backgroundColor="blue" color="white">
                    {line.charAt(cursorPosInLine) || " "}
                  </Text>
                  <Text>{line.substring(cursorPosInLine + 1)}</Text>
                </>
              ) : (
                <Text>{line === "" ? " " : line}</Text>
              )}
            </Box>
          ))
        ) : (
          <Box>
            <Text color="blue" bold>
              {">"}{" "}
            </Text>
            {disabled ? (
              <Text> </Text>
            ) : (
              <>
                <Text backgroundColor="blue" color="white">
                  {" "}
                </Text>
                <Text dimColor> {placeholder}</Text>
              </>
            )}
          </Box>
        )}
      </Box>
      {!disabled && (
        <Box marginLeft={1}>
          <Text dimColor>
            {showCommandSelector
              ? "↑↓ to navigate · Enter to select · Esc to cancel"
              : "Enter to send · \\Enter for newline · / for commands · Ctrl+C to exit"}
          </Text>
        </Box>
      )}
    </Box>
  );
}
