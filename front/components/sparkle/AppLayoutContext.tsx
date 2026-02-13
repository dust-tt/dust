import type { ReactNode } from "react";
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

interface AppLayoutSetters {
  setContentClassName: (v: string | undefined) => void;
  setContentWidth: (v: "centered" | "wide" | undefined) => void;
  setHasTitle: (v: boolean | undefined) => void;
  setHideSidebar: (v: boolean | undefined) => void;
  setNavChildren: (v: ReactNode) => void;
  setPageTitle: (v: string | undefined) => void;
  setSubNavigation: (v: SidebarNavigation[] | null | undefined) => void;
  setTitle: (v: ReactNode) => void;
}

// Two separate contexts: setters never change, so components that only write
// don't re-render when config changes.
const AppLayoutConfigContext = createContext<AppLayoutConfig>({});

const NOOP_SETTERS: AppLayoutSetters = {
  setContentClassName: () => {},
  setContentWidth: () => {},
  setHasTitle: () => {},
  setHideSidebar: () => {},
  setNavChildren: () => {},
  setPageTitle: () => {},
  setSubNavigation: () => {},
  setTitle: () => {},
};

const AppLayoutSettersContext = createContext<AppLayoutSetters>(NOOP_SETTERS);

interface AppLayoutProviderProps {
  children: ReactNode;
}

export function AppLayoutProvider({ children }: AppLayoutProviderProps) {
  const [contentClassName, setContentClassName] = useState<
    string | undefined
  >();
  const [contentWidth, setContentWidth] = useState<
    "centered" | "wide" | undefined
  >();
  const [hasTitle, setHasTitle] = useState<boolean | undefined>();
  const [hideSidebar, setHideSidebar] = useState<boolean | undefined>();
  const [navChildren, setNavChildren] = useState<ReactNode>();
  const [pageTitle, setPageTitle] = useState<string | undefined>();
  const [subNavigation, setSubNavigation] = useState<
    SidebarNavigation[] | null | undefined
  >();
  const [title, setTitle] = useState<ReactNode>();

  const config = useMemo(
    () => ({
      contentClassName,
      contentWidth,
      hasTitle,
      hideSidebar,
      navChildren,
      pageTitle,
      subNavigation,
      title,
    }),
    [
      contentClassName,
      contentWidth,
      hasTitle,
      hideSidebar,
      navChildren,
      pageTitle,
      subNavigation,
      title,
    ]
  );

  const setters = useMemo(
    () => ({
      setContentClassName,
      setContentWidth,
      setHasTitle,
      setHideSidebar,
      setNavChildren,
      setPageTitle,
      setSubNavigation,
      setTitle,
    }),
    [] // useState setters are stable
  );

  return (
    <AppLayoutSettersContext.Provider value={setters}>
      <AppLayoutConfigContext.Provider value={config}>
        {children}
      </AppLayoutConfigContext.Provider>
    </AppLayoutSettersContext.Provider>
  );
}

/**
 * Hook for AppContentLayout to read the current layout config.
 */
export function useAppLayout(): AppLayoutConfig {
  return useContext(AppLayoutConfigContext);
}

// --- Per-property setter hooks ---
// Each hook sets a layout property on mount/update and cleans up on unmount.
// Uses AppLayoutSettersContext (stable) so these never trigger re-renders.

export function useSetContentClassName(
  value: AppLayoutConfig["contentClassName"]
) {
  const { setContentClassName } = useContext(AppLayoutSettersContext);
  useIsomorphicLayoutEffect(() => {
    setContentClassName(value);
    return () => setContentClassName(undefined);
  }, [setContentClassName, value]);
}

export function useSetContentWidth(value: AppLayoutConfig["contentWidth"]) {
  const { setContentWidth } = useContext(AppLayoutSettersContext);
  useIsomorphicLayoutEffect(() => {
    setContentWidth(value);
    return () => setContentWidth(undefined);
  }, [setContentWidth, value]);
}

export function useSetHasTitle(value: AppLayoutConfig["hasTitle"]) {
  const { setHasTitle } = useContext(AppLayoutSettersContext);
  useIsomorphicLayoutEffect(() => {
    setHasTitle(value);
    return () => setHasTitle(undefined);
  }, [setHasTitle, value]);
}

export function useSetHideSidebar(value: AppLayoutConfig["hideSidebar"]) {
  const { setHideSidebar } = useContext(AppLayoutSettersContext);
  useIsomorphicLayoutEffect(() => {
    setHideSidebar(value);
    return () => setHideSidebar(undefined);
  }, [setHideSidebar, value]);
}

export function useSetNavChildren(value: AppLayoutConfig["navChildren"]) {
  const { setNavChildren } = useContext(AppLayoutSettersContext);
  useIsomorphicLayoutEffect(() => {
    setNavChildren(value);
    return () => setNavChildren(undefined);
  }, [setNavChildren, value]);
}

export function useSetPageTitle(value: AppLayoutConfig["pageTitle"]) {
  const { setPageTitle } = useContext(AppLayoutSettersContext);
  useIsomorphicLayoutEffect(() => {
    setPageTitle(value);
    return () => setPageTitle(undefined);
  }, [setPageTitle, value]);
}

export function useSetSubNavigation(value: AppLayoutConfig["subNavigation"]) {
  const { setSubNavigation } = useContext(AppLayoutSettersContext);
  useIsomorphicLayoutEffect(() => {
    setSubNavigation(value);
    return () => setSubNavigation(undefined);
  }, [setSubNavigation, value]);
}

export function useSetTitle(value: AppLayoutConfig["title"]) {
  const { setTitle } = useContext(AppLayoutSettersContext);
  useIsomorphicLayoutEffect(() => {
    setTitle(value);
    return () => setTitle(undefined);
  }, [setTitle, value]);
}
