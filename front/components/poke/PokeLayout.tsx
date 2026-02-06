import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import type { RegionType } from "@app/lib/api/regions/config";
import type {
  AuthContextNoWorkspaceValue,
  AuthContextValue,
} from "@app/lib/auth/AuthContext";
import { AuthContext, AuthContextNoWorkspace } from "@app/lib/auth/AuthContext";
import { Head } from "@app/lib/platform";
import { usePokeRegion } from "@app/lib/swr/poke";

export interface PokeLayoutProps {
  currentRegion: RegionType;
}

interface PokePageTitleContextValue {
  title: string;
  setTitle: (title: string) => void;
}

const PokePageTitleContext = createContext<PokePageTitleContextValue>({
  title: "Poke",
  setTitle: () => {},
});

export function usePokePageTitle() {
  return useContext(PokePageTitleContext).title;
}

export function useSetPokePageTitle(title: string) {
  const setTitle = useContext(PokePageTitleContext).setTitle;
  useEffect(() => {
    setTitle(title);
  }, [setTitle, title]);
}

// Layout for workspace-scoped poke pages (uses AuthContext).
export default function PokeLayout({
  children,
  authContext,
}: {
  children: React.ReactNode;
  authContext: AuthContextValue;
}) {
  const [title, setTitle] = useState("Poke");

  const titleContextValue = useMemo(
    () => ({ title, setTitle }),
    [title, setTitle]
  );

  return (
    <AuthContext.Provider value={authContext}>
      <ThemeProvider>
        <PokePageTitleContext.Provider value={titleContextValue}>
          <Head>
            <title>{"Poke - " + title}</title>
          </Head>
          <PokeLayoutContent>{children}</PokeLayoutContent>
        </PokePageTitleContext.Provider>
      </ThemeProvider>
    </AuthContext.Provider>
  );
}

// Layout for global poke pages without workspace (uses AuthContextNoWorkspace).
export function PokeLayoutNoWorkspace({
  children,
  authContext,
}: {
  children: React.ReactNode;
  authContext: AuthContextNoWorkspaceValue;
}) {
  const [title, setTitle] = useState("Poke");

  const titleContextValue = useMemo(
    () => ({ title, setTitle }),
    [title, setTitle]
  );

  return (
    <AuthContextNoWorkspace.Provider value={authContext}>
      <ThemeProvider>
        <PokePageTitleContext.Provider value={titleContextValue}>
          <Head>
            <title>{"Poke - " + title}</title>
          </Head>
          <PokeLayoutContent showRegionPicker>{children}</PokeLayoutContent>
        </PokePageTitleContext.Provider>
      </ThemeProvider>
    </AuthContextNoWorkspace.Provider>
  );
}

interface PokeLayoutContentProps {
  children: React.ReactNode;
  showRegionPicker?: boolean;
}

const PokeLayoutContent = ({
  children,
  showRegionPicker = false,
}: PokeLayoutContentProps) => {
  const { regionData } = usePokeRegion();
  const title = usePokePageTitle();
  const region = regionData?.region;
  const regionUrls = regionData?.regionUrls;
  return (
    <div className="min-h-dvh bg-muted-background dark:bg-muted-background-night dark:text-white">
      <PokeNavbar
        currentRegion={region}
        regionUrls={regionUrls}
        showRegionPicker={showRegionPicker}
        title={title}
      />
      <div className="flex flex-col p-6">{children}</div>
    </div>
  );
};
