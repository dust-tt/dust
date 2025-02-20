import React from "react";

import RootLayout from "@app/components/app/RootLayout";
import PokeNavbar from "@app/components/poke/PokeNavbar";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import type { RegionType } from "@app/lib/api/regions/config";
import { usePokeRegion } from "@app/lib/swr/poke";

export interface PokeLayoutProps {
  currentRegion: RegionType;
}

export default function PokeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <RootLayout>
        <PokeLayoutContent>{children}</PokeLayoutContent>
      </RootLayout>
    </ThemeProvider>
  );
}

interface PokeLayoutContentProps {
  children: React.ReactNode;
}

const PokeLayoutContent = ({ children }: PokeLayoutContentProps) => {
  const { region } = usePokeRegion();

  return (
    <div className="min-h-screen bg-structure-50 dark:bg-structure-50-night dark:text-white">
      <PokeNavbar currentRegion={region} />
      <div className="flex flex-col p-6">{children}</div>
    </div>
  );
};
