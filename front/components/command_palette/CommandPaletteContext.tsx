import type { CommandPaletteCategory } from "@app/components/command_palette/CommandPaletteSearchPhase";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type OpenCommandPaletteOptions = {
  /** Preselect a category chip (hides recent items in favor of a CTA). */
  category?: CommandPaletteCategory;
};

interface CommandPaletteContextType {
  isOpen: boolean;
  /** Category requested when opening; cleared when the palette closes. */
  initialCategory: CommandPaletteCategory | null;
  open: (options?: OpenCommandPaletteOptions) => void;
  close: () => void;
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
  const [initialCategory, setInitialCategory] =
    useState<CommandPaletteCategory | null>(null);

  const open = useCallback((options?: OpenCommandPaletteOptions) => {
    setInitialCategory(options?.category ?? null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setInitialCategory(null);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      initialCategory,
      open,
      close,
    }),
    [isOpen, initialCategory, open, close]
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
