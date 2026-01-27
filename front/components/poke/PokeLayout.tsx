import React, { createContext, useContext } from "react";

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

const PokePageTitleContext = createContext<string>("");

export function usePokePageTitle() {
  return useContext(PokePageTitleContext);
}

// Layout for workspace-scoped poke pages (uses AuthContext).
export default function PokeLayout({
  children,
  title,
  authContext,
}: {
  children: React.ReactNode;
  title: string;
  authContext: AuthContextValue;
}) {
  return (
    <AuthContext.Provider value={authContext}>
      <ThemeProvider>
        <PokePageTitleContext.Provider value={title}>
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
  title,
  authContext,
}: {
  children: React.ReactNode;
  title: string;
  authContext: AuthContextNoWorkspaceValue;
}) {
  return (
    <AuthContextNoWorkspace.Provider value={authContext}>
      <ThemeProvider>
        <PokePageTitleContext.Provider value={title}>
          <Head>
            <title>{"Poke - " + title}</title>
          </Head>
          <PokeLayoutContent>{children}</PokeLayoutContent>
        </PokePageTitleContext.Provider>
      </ThemeProvider>
    </AuthContextNoWorkspace.Provider>
  );
}

interface PokeLayoutContentProps {
  children: React.ReactNode;
}

const PokeLayoutContent = ({ children }: PokeLayoutContentProps) => {
  const { regionData } = usePokeRegion();
  const title = usePokePageTitle();
  const region = regionData?.region;
  const regionUrls = regionData?.regionUrls;
  return (
    <div className="min-h-dvh bg-muted-background dark:bg-muted-background-night dark:text-white">
      <PokeNavbar
        currentRegion={region}
        regionUrls={regionUrls}
        title={title}
      />
      <div className="flex flex-col p-6">{children}</div>
    </div>
  );
};
