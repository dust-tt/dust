"use client";

import { useEffect } from "react";

import {
  Command,
  useCommandPaletteContext,
} from "../contexts/CommandPaletteContext";

interface UseCommandPaletteProps {
  commands?: Command[];
  entityType?: string;
  entityId?: string;
}

/**
 * Hook for interacting with the command palette
 *
 * Optionally register commands when the component mounts and
 * automatically unregister them when the component unmounts.
 */
export const useCommandPalette = (props?: UseCommandPaletteProps) => {
  const {
    commands: allCommands,
    isOpen,
    registerCommand,
    registerCommands,
    unregisterCommand,
    unregisterCommandsByEntityType,
    unregisterCommandsByEntityId,
    setOpen,
  } = useCommandPaletteContext();

  // Register commands on mount, unregister on unmount
  useEffect(() => {
    if (props?.commands?.length) {
      registerCommands(props.commands);
    }

    return () => {
      // Clean up commands when component unmounts
      if (props?.entityType) {
        unregisterCommandsByEntityType(props.entityType);
      }
      if (props?.entityId) {
        unregisterCommandsByEntityId(props.entityId);
      }
      if (props?.commands) {
        props.commands.forEach((command) => {
          unregisterCommand(command.id);
        });
      }
    };
  }, [
    props?.commands,
    props?.entityType,
    props?.entityId,
    registerCommands,
    unregisterCommand,
    unregisterCommandsByEntityType,
    unregisterCommandsByEntityId,
  ]);

  // Utility functions
  const openCommandPalette = () => setOpen(true);
  const closeCommandPalette = () => setOpen(false);
  const toggleCommandPalette = () => setOpen(!isOpen);

  return {
    // State
    commands: allCommands,
    isOpen,

    // Register/unregister methods
    registerCommand,
    registerCommands,
    unregisterCommand,
    unregisterCommandsByEntityType,
    unregisterCommandsByEntityId,

    // Open/close controls
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    setOpen,
  };
};
