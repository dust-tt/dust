"use client";

import React, { useMemo } from "react";

import { CommandPaletteProvider } from "../contexts/CommandPaletteContext";
import { useCommandPalette } from "../hooks/useCommandPalette";
import { CommandPalette } from "./CommandPalette";

interface AppCommandPaletteProps {
  children: React.ReactNode;
}

function GlobalCommands() {
  const globalCommands = useMemo(
    () => [
      {
        id: "global.help",
        label: "Help",
        shortcut: "?",
        category: "System",
        action: () => {
          window.alert("Help requested");
        },
        priority: 0,
      },
      {
        id: "global.settings",
        label: "Settings",
        category: "System",
        action: () => {
          window.alert("Navigate to settings");
        },
        priority: 0,
      },
      // Add more global commands here
    ],
    []
  );

  // Register global commands
  useCommandPalette({ commands: globalCommands });

  return null;
}

/**
 * AppCommandPalette - Provides the command palette context to the entire app
 * and initializes it with global commands
 */
export function AppCommandPalette({ children }: AppCommandPaletteProps) {
  return (
    <CommandPaletteProvider>
      <GlobalCommands />
      <CommandPalette />
      {children}
    </CommandPaletteProvider>
  );
}
