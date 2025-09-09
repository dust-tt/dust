import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface DesktopNavigationContextType {
  isNavigationBarOpen: boolean;
  toggleNavigationBar: () => void;
  setIsNavigationBarOpen: (open: boolean) => void;
}

const DesktopNavigationContext =
  createContext<DesktopNavigationContextType | null>(null);

interface DesktopNavigationProviderProps {
  children: ReactNode;
  defaultOpen?: boolean;
}

export function DesktopNavigationProvider({
  children,
  defaultOpen = true,
}: DesktopNavigationProviderProps) {
  const [isNavigationBarOpen, setIsNavigationBarOpen] = useState(defaultOpen);

  const toggleNavigationBar = useCallback(() => {
    setIsNavigationBarOpen((prev) => !prev);
  }, [setIsNavigationBarOpen]);

  const value = useMemo(
    () => ({
      setIsNavigationBarOpen,
      toggleNavigationBar,
      isNavigationBarOpen,
    }),
    [setIsNavigationBarOpen, toggleNavigationBar, isNavigationBarOpen]
  );

  return (
    <DesktopNavigationContext.Provider value={value}>
      {children}
    </DesktopNavigationContext.Provider>
  );
}

export function useDesktopNavigation() {
  const context = useContext(DesktopNavigationContext);
  if (!context) {
    throw new Error(
      "useDesktopNavigation must be used within a DesktopNavigationProvider"
    );
  }
  return context;
}
