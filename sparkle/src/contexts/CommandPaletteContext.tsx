"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

// Command type definition
export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon?: React.ComponentType<{ className?: string | undefined }>;
  action: () => void;
  closeCommandPaletteOnAction?: boolean;
  category?: string;
  priority?: number;
  entityType?: string;
  entityId?: string;
  tooltip?: string | React.ReactNode;

  disabled?: boolean;
  /**
   * Tooltip to display when the command is disabled.
   * Overrides the default tooltip if it exists.
   */
  disabledTooltip?: string | React.ReactNode;
}

interface CommandPaletteContextType {
  commands: Command[];
  isOpen: boolean;
  registerCommand: (command: Command) => void;
  registerCommands: (commands: Command[]) => void;
  unregisterCommand: (commandId: string) => void;
  unregisterCommandsByEntityType: (entityType: string) => void;
  unregisterCommandsByEntityId: (entityId: string) => void;
  setOpen: (isOpen: boolean) => void;
}

const CommandPaletteContext = createContext<
  CommandPaletteContextType | undefined
>(undefined);

export const CommandPaletteProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [commands, setCommands] = useState<Command[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Register a single command
  const registerCommand = useCallback((command: Command) => {
    setCommands((prevCommands) => {
      // Check if command with same ID already exists
      const index = prevCommands.findIndex((c) => c.id === command.id);
      if (index >= 0) {
        // Replace existing command
        const newCommands = [...prevCommands];
        newCommands[index] = command;
        return newCommands;
      }
      // Add new command
      return [...prevCommands, command];
    });
  }, []);

  // Register multiple commands at once
  const registerCommands = useCallback((newCommands: Command[]) => {
    setCommands((prevCommands) => {
      const commandMap = new Map(prevCommands.map((c) => [c.id, c]));

      // Update or add new commands
      newCommands.forEach((command) => {
        commandMap.set(command.id, command);
      });

      return Array.from(commandMap.values());
    });
  }, []);

  // Unregister a command by ID
  const unregisterCommand = useCallback((commandId: string) => {
    setCommands((prevCommands) =>
      prevCommands.filter((c) => c.id !== commandId)
    );
  }, []);

  // Unregister commands by entity type
  const unregisterCommandsByEntityType = useCallback((entityType: string) => {
    setCommands((prevCommands) =>
      prevCommands.filter((c) => c.entityType !== entityType)
    );
  }, []);

  // Unregister commands by entity ID
  const unregisterCommandsByEntityId = useCallback((entityId: string) => {
    setCommands((prevCommands) =>
      prevCommands.filter((c) => c.entityId !== entityId)
    );
  }, []);

  // Handle keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const contextValue: CommandPaletteContextType = {
    commands,
    isOpen,
    registerCommand,
    registerCommands,
    unregisterCommand,
    unregisterCommandsByEntityType,
    unregisterCommandsByEntityId,
    setOpen: setIsOpen,
  };

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      {children}
    </CommandPaletteContext.Provider>
  );
};

export const useCommandPaletteContext = (): CommandPaletteContextType => {
  const context = useContext(CommandPaletteContext);
  if (context === undefined) {
    throw new Error(
      "useCommandPaletteContext must be used within a CommandPaletteProvider"
    );
  }
  return context;
};
