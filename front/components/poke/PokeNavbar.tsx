import { Button, Logo } from "@dust-tt/sparkle";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PokeRegionDropdown } from "@app/components/poke/PokeRegionDropdown";
import {
  PokeCommandDialog,
  PokeCommandInput,
  PokeCommandItem,
  PokeCommandList,
} from "@app/components/poke/shadcn/ui/command";
import type { RegionType } from "@app/lib/api/regions/config";
import { classNames } from "@app/lib/utils";
import { usePokeSearch } from "@app/poke/swr/search";
import { isDevelopment } from "@app/types";

interface PokeNavbarProps {
  currentRegion?: RegionType;
  regionUrls?: Record<RegionType, string>;
}

function PokeNavbar({ currentRegion, regionUrls }: PokeNavbarProps) {
  return (
    <nav
      className={classNames(
        "flex items-center justify-between px-4 py-6 pr-8",
        isDevelopment() ? "bg-brand" : "bg-red-500"
      )}
    >
      <div className="flex items-center">
        <Link href="/poke">
          <Logo type="colored-grey" className="-mr-5 h-4 w-32 p-0" />
        </Link>
        <div className="flex flex-row gap-4">
          <Button href="/poke/plans" variant="ghost" label="Plans" />
          <Button href="/poke/templates" variant="ghost" label="Templates" />
          <Button href="/poke/plugins" variant="ghost" label="Plugins" />
          <Button href="/poke/kill" variant="ghost" label="Kill Switches" />
          <Button href="/poke/pokefy" variant="ghost" label="Pokefy URL" />
        </div>
      </div>
      <div className="items-right flex gap-6">
        {currentRegion && (
          <PokeRegionDropdown
            currentRegion={currentRegion}
            regionUrls={regionUrls}
          />
        )}
        <PokeSearchCommand />
      </div>
    </nav>
  );
}

export default PokeNavbar;

export function PokeSearchCommand() {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { isError, isLoading, results } = usePokeSearch({
    // Disable search until the user has typed at least 2 characters.
    disabled: searchTerm.length < 2,
    search: searchTerm,
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);

    return () => document.removeEventListener("keydown", down);
  }, [open, results]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        label="Search (⌘K)"
        onClick={() => setOpen(true)}
      />
      <PokeCommandDialog
        open={open}
        onOpenChange={setOpen}
        className="bg-muted-background sm:max-w-[600px]"
        shouldFilter={false}
      >
        <PokeCommandInput
          placeholder="Type a command or search..."
          onValueChange={(value) => setSearchTerm(value)}
          className="border-none focus:outline-none focus:ring-0"
        />
        <PokeCommandList>
          {isLoading && <div className="p-4 text-sm">Searching...</div>}
          {searchTerm &&
            searchTerm.length >= 2 &&
            !isError &&
            !isLoading &&
            results.length === 0 && (
              <div className="p-4 text-sm">No results found.</div>
            )}
          {isError && <div className="p-4 text-sm">Something went wrong.</div>}
          {searchTerm.length < 2 && (
            <div className="p-4 text-sm">Enter at least 2 characters...</div>
          )}

          {results.map(({ id, link, name }, index) =>
            link ? (
              <Link href={link} key={id}>
                <PokeCommandItem value={name} index={index}>
                  {name} (id: {id})
                </PokeCommandItem>
              </Link>
            ) : (
              <PokeCommandItem key={id} value={name} index={index}>
                {name} (id: {id})
              </PokeCommandItem>
            )
          )}
        </PokeCommandList>
      </PokeCommandDialog>
    </>
  );
}
