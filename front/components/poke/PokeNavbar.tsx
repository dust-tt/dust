import {
  Button,
  ChevronRightIcon,
  Chip,
  LinkWrapper,
  Logo,
} from "@dust-tt/sparkle";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useState } from "react";

import { PokeFavoriteButton } from "@app/components/poke/PokeFavorites";
import { PokeRegionDropdown } from "@app/components/poke/PokeRegionDropdown";
import {
  PokeCommandDialog,
  PokeCommandInput,
  PokeCommandItem,
  PokeCommandList,
} from "@app/components/poke/shadcn/ui/command";
import type { RegionType } from "@app/lib/api/regions/config";
import {
  useRegionContext,
  useRegionContextSafe,
} from "@app/lib/auth/RegionContext";
import { getRegionChipColor, getRegionDisplay } from "@app/lib/poke/regions";
import { usePokeRegion } from "@app/lib/swr/poke";
import { classNames } from "@app/lib/utils";
import { usePokeSearch, usePokeSearchAllRegions } from "@app/poke/swr/search";
import type { PokeItemBase } from "@app/types/poke";
import { isDevelopment } from "@app/types/shared/env";

const MIN_SEARCH_CHARACTERS = 2;

interface PokeNavbarProps {
  currentRegion?: RegionType;
  regionUrls?: Record<RegionType, string>;
  showRegionPicker?: boolean;
  title: string;
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
    case "Frame":
      return "highlight";
    default:
      return "primary";
  }
}

function PokeNavbar({
  currentRegion,
  regionUrls,
  showRegionPicker = false,
  title,
}: PokeNavbarProps) {
  return (
    <nav
      className={classNames(
        "flex items-center justify-between px-4 py-6 pr-8",
        isDevelopment() ? "bg-brand" : "bg-red-500"
      )}
    >
      <div className="flex items-center">
        <LinkWrapper href="/poke">
          <Logo type="colored-grey" className="-mr-5 h-4 w-32 p-0" />
        </LinkWrapper>
        <div className="flex flex-row gap-4">
          <Button href="/poke/plans" variant="ghost" label="Plans" />
          <Button href="/poke/templates" variant="ghost" label="Templates" />
          <Button href="/poke/plugins" variant="ghost" label="Plugins" />
          <Button href="/poke/kill" variant="ghost" label="Kill Switches" />
          <Button href="/poke/pokefy" variant="ghost" label="Pokefy URL" />
          <Button
            href="/poke/production-checks"
            variant="ghost"
            label="Production Checks"
          />
        </div>
      </div>
      <div className="items-right flex items-center gap-4">
        <PokeFavoriteButton title={title} />
        {showRegionPicker && currentRegion && (
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

/**
 * Entry point that renders the appropriate search command based on mode.
 * - SPA mode: Multi-region search with region switching
 * - NextJS mode: Single-region search (legacy)
 */
export function PokeSearchCommand() {
  const regionContext = useRegionContextSafe();

  // SPA mode has region context available.
  if (regionContext) {
    return <PokeSearchCommandSPA />;
  }

  return <PokeSearchCommandLegacy />;
}

/**
 * SPA mode: Search across all regions in parallel.
 */
function PokeSearchCommandSPA() {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { regionInfo, setRegionInfo } = useRegionContext();
  const { regionData } = usePokeRegion();
  const regionUrls = regionData?.regionUrls ?? null;

  const { isError, isLoading, results } = usePokeSearchAllRegions({
    disabled: searchTerm.length < MIN_SEARCH_CHARACTERS,
    search: searchTerm,
    regionUrls,
  });

  const handleItemClick = useCallback(
    (item: PokeItemBase) => {
      // Switch region if the item is from a different region.
      if (item.region && item.region !== regionInfo?.name && regionUrls) {
        setRegionInfo({ name: item.region, url: regionUrls[item.region] });
      }
      setOpen(false);
    },
    [regionInfo, setRegionInfo, regionUrls]
  );

  return (
    <PokeSearchCommandUI
      open={open}
      onOpenChange={setOpen}
      searchTerm={searchTerm}
      onSearchTermChange={setSearchTerm}
      results={results}
      isLoading={isLoading}
      isError={isError}
      onItemClick={handleItemClick}
      showRegion
    />
  );
}

/**
 * NextJS mode: Single-region search (legacy).
 */
function PokeSearchCommandLegacy() {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { isError, isLoading, results } = usePokeSearch({
    disabled: searchTerm.length < MIN_SEARCH_CHARACTERS,
    search: searchTerm,
  });

  const handleItemClick = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <PokeSearchCommandUI
      open={open}
      onOpenChange={setOpen}
      searchTerm={searchTerm}
      onSearchTermChange={setSearchTerm}
      results={results}
      isLoading={isLoading}
      isError={isError}
      onItemClick={handleItemClick}
      showRegion={false}
    />
  );
}

interface PokeSearchCommandUIProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  results: PokeItemBase[];
  isLoading: boolean;
  isError: boolean;
  onItemClick: (item: PokeItemBase) => void;
  showRegion: boolean;
}

/**
 * Shared UI component for the search command dialog.
 */
function PokeSearchCommandUI({
  open,
  onOpenChange,
  searchTerm,
  onSearchTermChange,
  results,
  isLoading,
  isError,
  onItemClick,
  showRegion,
}: PokeSearchCommandUIProps) {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);

    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        label="Search (⌘K)"
        onClick={() => onOpenChange(true)}
      />
      <PokeCommandDialog
        open={open}
        onOpenChange={onOpenChange}
        className="bg-muted-background sm:max-w-[600px]"
        shouldFilter={false}
      >
        <PokeCommandInput
          placeholder="Type a command or search..."
          onValueChange={(value) => onSearchTermChange(value.trim())}
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
                <div>
                  <span className="font-medium">Frame token:</span>{" "}
                  <span className="font-mono">
                    a1b2c3d4-e5f6-7890-abcd-ef1234567890
                  </span>
                </div>
              </div>
            </div>
          )}

          {results.map((item, index) => {
            const CommandItemContent = () => (
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
                    {showRegion && item.region && (
                      <Chip size="xs" color={getRegionChipColor(item.region)}>
                        {getRegionDisplay(item.region)}
                      </Chip>
                    )}
                  </div>
                  <ChevronRightIcon className="h-4 w-4 flex-shrink-0" />
                </div>
              </PokeCommandItem>
            );

            const key = `${item.region ?? "default"}-${item.id}`;

            return item.link ? (
              <div key={key} onClick={() => onItemClick(item)}>
                <LinkWrapper href={item.link}>
                  <CommandItemContent />
                </LinkWrapper>
              </div>
            ) : (
              <CommandItemContent key={key} />
            );
          })}
        </PokeCommandList>
      </PokeCommandDialog>
    </>
  );
}
