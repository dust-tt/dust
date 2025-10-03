import Head from "next/head";
import React from "react";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import type { RegionType } from "@app/lib/api/regions/config";
import { usePokeRegion } from "@app/lib/swr/poke";

export interface PokeLayoutProps {
  currentRegion: RegionType;
}

export default function PokeLayout({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <ThemeProvider>
      <Head>
        <title>{"Poke - " + title}</title>
      </Head>
      <PokeLayoutContent>{children}</PokeLayoutContent>
    </ThemeProvider>
  );
}

interface PokeLayoutContentProps {
  children: React.ReactNode;
}

const PokeLayoutContent = ({ children }: PokeLayoutContentProps) => {
  const { regionData } = usePokeRegion();
  const region = regionData?.region;
  const regionUrls = regionData?.regionUrls;
  return (
    <div className="min-h-dvh bg-muted-background dark:bg-muted-background-night dark:text-white">
      <PokeNavbar currentRegion={region} regionUrls={regionUrls} />
      <div className="flex flex-col p-6">{children}</div>
    </div>
  );
};
