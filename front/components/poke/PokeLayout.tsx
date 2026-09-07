import PokeNavbar from "@app/components/poke/PokeNavbar";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import type {
  AuthContextNoWorkspaceValue,
  AuthContextValue,
} from "@app/lib/auth/AuthContext";
import { AuthContext, AuthContextNoWorkspace } from "@app/lib/auth/AuthContext";
import { usePokeCells } from "@app/lib/swr/poke";
import type React from "react";

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
        <PokeLayoutContent showCellPicker>{children}</PokeLayoutContent>
      </ThemeProvider>
    </AuthContextNoWorkspace.Provider>
  );
}

interface PokeLayoutContentProps {
  children: React.ReactNode;
  showCellPicker?: boolean;
}

const PokeLayoutContent = ({
  children,
  showCellPicker = false,
}: PokeLayoutContentProps) => {
  const { cells } = usePokeCells();
  return (
    // Poke overrides the default border token with the form one: the subtle stone-100 border is
    // invisible on dense backoffice pages, and per-component overrides do not scale.
    <div className="min-h-dvh bg-background text-foreground [--color-border:var(--color-border-form)]">
      <PokeNavbar cells={cells ?? undefined} showCellPicker={showCellPicker} />
      <div className="flex flex-col p-6">{children}</div>
    </div>
  );
};
