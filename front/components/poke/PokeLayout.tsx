import PokeNavbar from "@app/components/poke/PokeNavbar";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import type { RegionType } from "@app/lib/api/regions/config";
import type {
  AuthContextNoWorkspaceValue,
  AuthContextValue,
} from "@app/lib/auth/AuthContext";
import { AuthContext, AuthContextNoWorkspace } from "@app/lib/auth/AuthContext";
import { usePokeRegion } from "@app/lib/swr/poke";
import type React from "react";

export interface PokeLayoutProps {
  currentRegion: RegionType;
}

// Layout for workspace-scoped poke pages (uses AuthContext).
export default function PokeLayout({
  children,
  authContext,
}: {
  children: React.ReactNode;
  authContext: AuthContextValue;
}) {
  return (
    <AuthContext.Provider value={authContext}>
      <ThemeProvider>
        <PokeLayoutContent>{children}</PokeLayoutContent>
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
  return (
    <AuthContextNoWorkspace.Provider value={authContext}>
      <ThemeProvider>
        <PokeLayoutContent showRegionPicker>{children}</PokeLayoutContent>
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
  const regionUrls = regionData?.regionUrls;
  return (
    <div className="min-h-dvh bg-muted-background dark:bg-muted-background-night dark:text-white">
      <PokeNavbar regionUrls={regionUrls} showRegionPicker={showRegionPicker} />
      <div className="flex flex-col p-6">{children}</div>
    </div>
  );
};
