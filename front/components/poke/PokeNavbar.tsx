import { PokeCellDropdown } from "@app/components/poke/PokeCellDropdown";
import {
  PokeFavoriteButton,
  PokeFavoritesCommandGroups,
} from "@app/components/poke/PokeFavorites";
import { PokeThemeSelector } from "@app/components/poke/PokeThemeSelector";
import {
  PokeCommandDialog,
  PokeCommandInput,
  PokeCommandItem,
  PokeCommandList,
} from "@app/components/poke/shadcn/ui/command";
import { useCellContext } from "@app/lib/auth/CellContext";
import { getCellChipColor, getCellDisplay } from "@app/lib/poke/cells";
import { usePokeCells } from "@app/lib/swr/poke";
import { classNames } from "@app/lib/utils";
import { usePokeSearchAllCells } from "@app/poke/swr/search";
import type { CellInfo } from "@app/types/cell";
import type { PokeItemBase } from "@app/types/poke";
import { isDevelopment } from "@app/types/shared/env";
import {
  Button,
  ChevronRight,
  Chip,
  LinkWrapper,
  Logo,
} from "@dust-tt/sparkle";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useState } from "react";

const MIN_SEARCH_CHARACTERS = 2;

interface PokeNavbarProps {
  cells?: CellInfo[];
  showCellPicker?: boolean;
}

function getPokeItemChipColor(
  item: PokeItemBase
): ComponentProps<typeof Chip>["color"] {
  switch (item.type) {
    case "Workspace":
      return "highlight";
    case "Data Source":
      return "info";
    case "Data Source View":
      return "warning";
    case "Connector":
      return "success";
    case "Frame":
    case "File":
      return "highlight";
    case "Space":
    case "Group":
      return "info";
    case "Skill":
    case "Webhook Source":
      return "warning";
    default:
      return "primary";
  }
}

function PokeNavbar({ cells, showCellPicker = false }: PokeNavbarProps) {
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
          <Button href="/poke/coupons" variant="ghost" label="Coupons" />
          <Button href="/poke/templates" variant="ghost" label="Templates" />
          <Button href="/poke/plugins" variant="ghost" label="Plugins" />
          <Button
            href="/poke/feature-flags"
            variant="ghost"
            label="Feature Flags"
          />
          <Button href="/poke/kill" variant="ghost" label="Kill Switches" />
          <Button href="/poke/cache" variant="ghost" label="Cache" />
          <Button href="/poke/pokefy" variant="ghost" label="Pokefy URL" />
          <Button
            href="/poke/production-checks"
            variant="ghost"
            label="Production Checks"
          />
          <Button
            href="/poke/global-agent-feedbacks"
            variant="ghost"
            label="Agent Feedback"
          />
        </div>
      </div>
      <div className="items-right flex items-center gap-4">
        <PokeThemeSelector />
        <PokeFavoriteButton />
        {showCellPicker && <PokeCellDropdown cells={cells} />}
        <PokeSearchCommand />
      </div>
    </nav>
  );
}

export default PokeNavbar;

function PokeSearchCommand() {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { cellInfo, setCellInfo } = useCellContext();
  const { cells } = usePokeCells();

  const { isError, isLoading, results } = usePokeSearchAllCells({
    disabled: searchTerm.length < MIN_SEARCH_CHARACTERS,
    search: searchTerm,
    cells,
  });

  const handleItemClick = useCallback(
    (item: PokeItemBase) => {
      const targetCell = cells?.find((cell) => cell.name === item.cell);
      if (targetCell && targetCell.name !== cellInfo.name) {
        setCellInfo(targetCell);
      }
      setOpen(false);
    },
    [cellInfo, setCellInfo, cells]
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
      showCell
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
  showCell: boolean;
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
  showCell,
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
          className="border-none focus:outline-hidden focus:ring-0"
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
            <PokeFavoritesCommandGroups
              onNavigate={() => onOpenChange(false)}
            />
          )}
          {searchTerm.length < MIN_SEARCH_CHARACTERS && (
            <div className="p-4 text-sm">
              <div className="mb-3 text-muted-foreground">
                Search for resources by:
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium">Workspace ID:</span>{" "}
                  <span className="font-mono">123456</span>
                </div>
                <div>
                  <span className="font-medium">WorkOS org ID:</span>{" "}
                  <span className="font-mono">org_01AB</span>
                </div>
                <div>
                  <span className="font-medium">Resource sId:</span>{" "}
                  <span className="font-mono">
                    vlt_ / grp_ / skl_ / msv_ / whs_ / fil_ / dsv_ / dts_
                  </span>
                </div>
                <div>
                  <span className="font-medium">Dust API project ID:</span>{" "}
                  <span className="font-mono">123456</span>
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
                <div>
                  <span className="font-medium">Phone number:</span>{" "}
                  <span className="font-mono">+33612345678</span>
                </div>
              </div>
            </div>
          )}

          {results.map((item, index) => {
            const CommandItemContent = () => (
              <PokeCommandItem value={item.name} index={index}>
                <div className="flex w-full items-center justify-between gap-3 px-2 text-foreground">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <Chip size="xs" color={getPokeItemChipColor(item)}>
                      {item.type}
                    </Chip>
                    <span className="text-sm font-medium">{item.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      (id: {item.id})
                    </span>
                    {showCell && item.region && item.cell && (
                      <Chip size="xs" color={getCellChipColor(item.region)}>
                        {getCellDisplay({
                          name: item.cell,
                          region: item.region,
                        })}
                      </Chip>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0" />
                </div>
              </PokeCommandItem>
            );

            const key = `${item.cell ?? item.region ?? "default"}-${item.id}`;

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
