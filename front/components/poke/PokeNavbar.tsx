import { Button, ChevronRightIcon, Chip, Logo } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";

import { PokeFavoriteButton } from "@app/components/poke/PokeFavorites";
import { usePokePageTitle } from "@app/components/poke/PokeLayout";
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
import type { PokeItemBase } from "@app/types";
import { isDevelopment } from "@app/types";

const MIN_SEARCH_CHARACTERS = 2;

interface PokeNavbarProps {
  currentRegion?: RegionType;
  regionUrls?: Record<RegionType, string>;
}

function getPokeItemChipColor(
  item: PokeItemBase
): ComponentProps<typeof Chip>["color"] {
  switch (item.type) {
    case "Workspace":
      return "blue";
    case "Data Source":
      return "golden";
    case "Data Source View":
      return "rose";
    case "Connector":
      return "green";
    default:
      return "primary";
  }
}

function PokeNavbar({ currentRegion, regionUrls }: PokeNavbarProps) {
  const title = usePokePageTitle();

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
      <div className="items-right flex items-center gap-4">
        <PokeFavoriteButton title={title} />
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
    // Disable search until the user has typed at least MIN_SEARCH_CHARACTERS characters.
    disabled: searchTerm.length < MIN_SEARCH_CHARACTERS,
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
          onValueChange={(value) => setSearchTerm(value.trim())}
          className="border-none focus:outline-none focus:ring-0"
        />
        <PokeCommandList>
          {isLoading && <div className="p-4 text-sm">Searching...</div>}
          {searchTerm &&
            searchTerm.length >= MIN_SEARCH_CHARACTERS &&
            !isError &&
            !isLoading &&
            results.length === 0 && (
              <div className="p-4 text-sm">No results found.</div>
            )}
          {isError && <div className="p-4 text-sm">Something went wrong.</div>}
          {searchTerm.length < MIN_SEARCH_CHARACTERS && (
            <div className="p-4 text-sm">
              <div className="mb-3 text-muted-foreground dark:text-muted-foreground-night">
                Search for resources by:
              </div>
              <div className="space-y-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
                <div>
                  <span className="font-medium">Workspace ID:</span>{" "}
                  <span className="font-mono">123456</span>
                </div>
                <div>
                  <span className="font-medium">WorkOS org ID:</span>{" "}
                  <span className="font-mono">org_01AB</span>
                </div>
                <div>
                  <span className="font-medium">Data source view:</span>{" "}
                  <span className="font-mono">dsv_abc123</span>
                </div>
                <div>
                  <span className="font-medium">Data source:</span>{" "}
                  <span className="font-mono">dts_abc123</span>
                </div>
                <div>
                  <span className="font-medium">Connector ID:</span>{" "}
                  <span className="font-mono">78901</span>
                </div>
              </div>
            </div>
          )}

          {results.map((item, index) => {
            const CommandItem = () => (
              <PokeCommandItem value={item.name} index={index}>
                <div className="flex w-full items-center justify-between gap-3 px-2 text-foreground dark:text-foreground-night">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <Chip size="xs" color={getPokeItemChipColor(item)}>
                      {item.type}
                    </Chip>
                    <span className="text-sm font-medium">{item.name}</span>
                    <span className="font-mono text-xs text-muted-foreground dark:text-muted-foreground-night">
                      (id: {item.id})
                    </span>
                  </div>
                  <ChevronRightIcon className="h-4 w-4 flex-shrink-0" />
                </div>
              </PokeCommandItem>
            );

            return item.link ? (
              <Link href={item.link} key={item.id}>
                <CommandItem />
              </Link>
            ) : (
              <CommandItem />
            );
          })}
        </PokeCommandList>
      </PokeCommandDialog>
    </>
  );
}
