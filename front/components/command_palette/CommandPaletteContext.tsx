import type { ComponentType, ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

// A command registered into the palette. Selecting it runs `onSelect` and closes.
export interface PaletteActionConfig {
  id: string;
  label: string;
  description?: string;
  // Sparkle icon, rendered via <Icon visual={icon} />.
  icon: ComponentType<{ className?: string }>;
  onSelect: () => void;
}

interface CommandPaletteContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  actions: PaletteActionConfig[];
  registerAction: (action: PaletteActionConfig) => void;
  unregisterAction: (id: string) => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextType | null>(
  null
);

interface CommandPaletteProviderProps {
  children: ReactNode;
}

export function CommandPaletteProvider({
  children,
}: CommandPaletteProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [actionsById, setActionsById] = useState<
    Map<string, PaletteActionConfig>
  >(() => new Map());

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const registerAction = useCallback((action: PaletteActionConfig) => {
    setActionsById((prev) => {
      const next = new Map(prev);
      next.set(action.id, action);
      return next;
    });
  }, []);

  const unregisterAction = useCallback((id: string) => {
    setActionsById((prev) => {
      if (!prev.has(id)) {
        return prev;
      }
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const actions = useMemo(
    () => Array.from(actionsById.values()),
    [actionsById]
  );

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      actions,
      registerAction,
      unregisterAction,
    }),
    [isOpen, open, close, actions, registerAction, unregisterAction]
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error(
      "useCommandPalette must be used within a CommandPaletteProvider"
    );
  }
  return context;
}

// Non-throwing variant for components that may render outside a provider.
export function useCommandPaletteOptional() {
  return useContext(CommandPaletteContext);
}
