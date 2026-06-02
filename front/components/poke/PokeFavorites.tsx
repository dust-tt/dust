import {
  PokeCommandGroup,
  PokeCommandItem,
} from "@app/components/poke/shadcn/ui/command";
import { useAppRouter } from "@app/lib/platform";
import { useCurrentPage } from "@app/poke/swr/currentPage";
import type { PokeFavorite, PokeFavoriteType } from "@app/poke/swr/favorites";
import { usePokeFavorites } from "@app/poke/swr/favorites";
import {
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
  IconButton,
  LinkWrapper,
  StarIcon,
  StarStrokeIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useState } from "react";

// Display order for favorite type groups; unknown types are appended last.
const TYPE_ORDER: PokeFavoriteType[] = [
  "Workspace",
  "Agent",
  "Space",
  "Data Source",
  "Data Source View",
  "MCP Server",
  "App",
  "Conversation",
  "Trigger",
  "Group",
  "Members",
  "Frame",
  "Skill",
  "Skill Suggestion",
  "Webhook Source",
  "LLM Trace",
  "Plugin",
  "Page",
];

export function getFavoriteChipColor(
  type: PokeFavoriteType
): ComponentProps<typeof Chip>["color"] {
  switch (type) {
    case "Workspace":
      return "blue";
    case "Data Source":
      return "golden";
    case "Data Source View":
      return "rose";
    case "Agent":
      return "green";
    case "Frame":
      return "highlight";
    default:
      return "primary";
  }
}

function groupByType(
  items: PokeFavorite[]
): { type: PokeFavoriteType; items: PokeFavorite[] }[] {
  const byType = new Map<PokeFavoriteType, PokeFavorite[]>();
  for (const item of items) {
    const existing = byType.get(item.data.type) ?? [];
    byType.set(item.data.type, [...existing, item]);
  }
  const rank = (type: PokeFavoriteType) => {
    const index = TYPE_ORDER.indexOf(type);
    return index === -1 ? TYPE_ORDER.length : index;
  };
  return [...byType.keys()]
    .sort((a, b) => rank(a) - rank(b))
    .map((type) => ({ type, items: byType.get(type) ?? [] }));
}

export function PokeFavoriteButton() {
  const router = useAppRouter();
  const current = useCurrentPage();
  const { isFavorite, toggleFavorite } = usePokeFavorites();
  const [hasMounted, setHasMounted] = useState(false);

  // Only enable favoriting once the current page has published metadata for THIS url, so we
  // never capture a half-loaded page (or a placeholder name).
  const currentForPath = current?.url === router.asPath ? current : null;
  const isCurrentlyFavorite =
    currentForPath !== null && isFavorite(currentForPath.url);

  const handleToggle = useCallback(() => {
    if (currentForPath) {
      toggleFavorite(currentForPath);
    }
  }, [currentForPath, toggleFavorite]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Keyboard shortcut: Cmd+D (Mac) or Ctrl+D (Windows/Linux).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "d" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleToggle();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleToggle]);

  if (!hasMounted) {
    return null;
  }

  return (
    <IconButton
      icon={isCurrentlyFavorite ? StarIcon : StarStrokeIcon}
      onClick={handleToggle}
      disabled={currentForPath === null}
      variant="outline"
      size="sm"
      tooltip={
        currentForPath === null
          ? "Loading…"
          : isCurrentlyFavorite
            ? "Remove from favorites (⌘D)"
            : "Add to favorites (⌘D)"
      }
    />
  );
}

interface PokeNavItemRowProps {
  item: PokeFavorite;
  onRemove?: (url: string) => void;
}

function PokeNavItemRow({ item, onRemove }: PokeNavItemRowProps) {
  return (
    <div className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
      <Chip size="xs" color={getFavoriteChipColor(item.data.type)}>
        {item.data.type}
      </Chip>
      <LinkWrapper href={item.url} className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground dark:text-foreground-night">
          {item.data.name}
        </span>
        {item.data.subtitle && (
          <span className="truncate text-xs text-muted-foreground dark:text-muted-foreground-night">
            {item.data.subtitle}
          </span>
        )}
      </LinkWrapper>
      {item.data.sId && (
        <span className="shrink-0 font-mono text-xs text-muted-foreground dark:text-muted-foreground-night">
          {item.data.sId}
        </span>
      )}
      {onRemove && (
        <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          <IconButton
            icon={XMarkIcon}
            onClick={() => onRemove(item.url)}
            size="xs"
            variant="outline"
            tooltip="Remove from favorites"
          />
        </div>
      )}
    </div>
  );
}

interface PokeNavItemGroupsProps {
  items: PokeFavorite[];
  onRemove?: (url: string) => void;
}

function PokeNavItemGroups({ items, onRemove }: PokeNavItemGroupsProps) {
  return (
    <div className="flex flex-col gap-4">
      {groupByType(items).map((group) => (
        <div key={group.type}>
          <h3 className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-muted-foreground-night">
            {group.type}
          </h3>
          <div className="flex flex-col">
            {group.items.map((item) => (
              <PokeNavItemRow key={item.url} item={item} onRemove={onRemove} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PokeFavoritesList() {
  const [hasMounted, setHasMounted] = useState(false);
  const { favorites, removeFavorite } = usePokeFavorites();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return null;
  }

  return (
    <div className="mb-6 rounded-xl border bg-white p-4 dark:border-border-night dark:bg-background-night">
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger>
          <div className="flex items-center gap-2">
            <Icon
              visual={StarIcon}
              size="sm"
              className="text-muted-foreground dark:text-muted-foreground-night"
            />
            <h2 className="text-lg font-semibold">Favorites</h2>
            {favorites.length > 0 && (
              <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                {favorites.length}
              </span>
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3">
            {favorites.length === 0 ? (
              <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                No favorites yet. Press{" "}
                <kbd className="rounded border px-1.5 py-0.5 font-mono text-xs">
                  ⌘D
                </kbd>{" "}
                on any page (or use the star in the top bar) to add it here.
              </p>
            ) : (
              <PokeNavItemGroups items={favorites} onRemove={removeFavorite} />
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

interface PokeNavCommandItemProps {
  item: PokeFavorite;
  index: number;
  onNavigate: () => void;
}

function PokeNavCommandItem({
  item,
  index,
  onNavigate,
}: PokeNavCommandItemProps) {
  return (
    <PokeCommandItem
      value={`${item.data.type} ${item.data.name} ${item.data.subtitle ?? ""} ${
        item.data.sId ?? ""
      } ${item.url}`}
      index={index}
      href={item.url}
      onClick={onNavigate}
    >
      <div className="flex w-full items-center gap-3 px-2 text-foreground dark:text-foreground-night">
        <Chip size="xs" color={getFavoriteChipColor(item.data.type)}>
          {item.data.type}
        </Chip>
        <span className="text-sm font-medium">{item.data.name}</span>
        {item.data.subtitle && (
          <span className="truncate text-xs text-muted-foreground dark:text-muted-foreground-night">
            {item.data.subtitle}
          </span>
        )}
        {item.data.sId && (
          <span className="font-mono text-xs text-muted-foreground dark:text-muted-foreground-night">
            {item.data.sId}
          </span>
        )}
      </div>
    </PokeCommandItem>
  );
}

interface PokeFavoritesCommandGroupsProps {
  onNavigate: () => void;
}

/**
 * Renders Favorites as a command-palette group. Shown in the ⌘K dialog when the search query
 * is empty.
 */
export function PokeFavoritesCommandGroups({
  onNavigate,
}: PokeFavoritesCommandGroupsProps) {
  const { favorites } = usePokeFavorites();

  if (favorites.length === 0) {
    return null;
  }

  return (
    <PokeCommandGroup heading="Favorites">
      {favorites.map((item, index) => (
        <PokeNavCommandItem
          key={item.url}
          item={item}
          index={index}
          onNavigate={onNavigate}
        />
      ))}
    </PokeCommandGroup>
  );
}
