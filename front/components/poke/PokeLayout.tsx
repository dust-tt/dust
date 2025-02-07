import React from "react";

import RootLayout from "@app/components/app/RootLayout";
import PokeNavbar from "@app/components/poke/PokeNavbar";
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
    <RootLayout>
      <PokeLayoutContent>{children}</PokeLayoutContent>
    </RootLayout>
  );
}

interface PokeLayoutContentProps {
  children: React.ReactNode;
}

const PokeLayoutContent = ({ children }: PokeLayoutContentProps) => {
  const { region } = usePokeRegion();

  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar currentRegion={region} />
      <div className="flex flex-col p-6">{children}</div>;
    </div>
  );
};
