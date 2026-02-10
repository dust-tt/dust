import type { DependencyList, ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import type { SidebarNavigation } from "@app/components/navigation/config";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface AppLayoutConfig {
  contentClassName?: string;
  contentWidth?: "centered" | "wide";
  hasTitle?: boolean;
  hideSidebar?: boolean;
  navChildren?: ReactNode;
  pageTitle?: string;
  subNavigation?: SidebarNavigation[] | null;
  title?: ReactNode;
}

const DEFAULT_CONFIG: AppLayoutConfig = {};

interface AppLayoutContextValue {
  config: AppLayoutConfig;
  setConfig: (config: AppLayoutConfig) => void;
}

const AppLayoutContext = createContext<AppLayoutContextValue>({
  config: DEFAULT_CONFIG,
  setConfig: () => {},
});

interface AppLayoutProviderProps {
  children: ReactNode;
}

export function AppLayoutProvider({ children }: AppLayoutProviderProps) {
  const [config, setConfig] = useState<AppLayoutConfig>(DEFAULT_CONFIG);

  const value = useMemo(() => ({ config, setConfig }), [config, setConfig]);

  return (
    <AppLayoutContext.Provider value={value}>
      {children}
    </AppLayoutContext.Provider>
  );
}

/**
 * Hook for pages/layouts to configure AppContentLayout.
 * Uses useLayoutEffect so the config is set synchronously before paint,
 * preventing flashes of stale layout during page transitions.
 * Cleanup resets to DEFAULT_CONFIG so stale config doesn't persist
 * when navigating to a page with different layout needs.
 */
export function useAppLayoutConfig(
  configFn: () => AppLayoutConfig,
  deps: DependencyList
): void {
  const { setConfig } = useContext(AppLayoutContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const config = useMemo(configFn, deps);
  useIsomorphicLayoutEffect(() => {
    setConfig(config);
    return () => setConfig(DEFAULT_CONFIG);
  }, [setConfig, config]);
}

/**
 * Hook for AppContentLayout to read the current layout config.
 */
export function useAppLayout(): AppLayoutConfig {
  return useContext(AppLayoutContext).config;
}
