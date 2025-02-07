import React from "react";

import RootLayout from "@app/components/app/RootLayout";
import PokeNavbar from "@app/components/poke/PokeNavbar";
import type { RegionType } from "@app/lib/api/regions/config";

export interface PokeLayoutProps {
  currentRegion: RegionType;
}

export default function PokeLayout({
  children,
  // pageProps,
}: {
  children: React.ReactNode;
  // pageProps: PokeLayoutProps;
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
  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="flex flex-col p-6">{children}</div>;
    </div>
  );
};
