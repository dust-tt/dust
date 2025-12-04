import {
  Chip,
  IconButton,
  StarIcon,
  StarStrokeIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

import { createFavorite, usePokeFavorites } from "@app/poke/swr/favorites";

interface PokeFavoriteButtonProps {
  title: string;
}

export function PokeFavoriteButton({ title }: PokeFavoriteButtonProps) {
  const router = useRouter();
  const { isFavorite, toggleFavorite } = usePokeFavorites();

  const url = router.asPath;
  const isCurrentlyFavorite = isFavorite(url);

  const handleToggle = useCallback(() => {
    toggleFavorite(createFavorite(url, title));
  }, [toggleFavorite, url, title]);

  // Keyboard shortcut: Cmd+D (Mac) or Ctrl+D (Windows/Linux)
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

  return (
    <IconButton
      icon={isCurrentlyFavorite ? StarIcon : StarStrokeIcon}
      onClick={handleToggle}
      variant="outline"
      size="sm"
      tooltip={
        isCurrentlyFavorite
          ? "Remove from favorites (⌘D)"
          : "Add to favorites (⌘D)"
      }
    />
  );
}

const COLLAPSED_LIMIT = 12;

export function PokeFavoritesList() {
  const { favorites, removeFavorite } = usePokeFavorites();
  const [isExpanded, setIsExpanded] = useState(false);

  if (favorites.length === 0) {
    return (
      <div className="mb-6 rounded-lg border p-4">
        <p className="text-sm">
          No favorites yet. Use the star button or press{" "}
          <kbd className="rounded px-1.5 py-0.5 font-mono text-xs">⌘D</kbd> on
          any page to add it here.
        </p>
      </div>
    );
  }

  const shouldCollapse = favorites.length > COLLAPSED_LIMIT;
  const displayedFavorites =
    shouldCollapse && !isExpanded
      ? favorites.slice(0, COLLAPSED_LIMIT)
      : favorites;
  const hiddenCount = favorites.length - COLLAPSED_LIMIT;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Favorites</h1>
      <div className="mb-6 flex flex-wrap gap-2">
        {displayedFavorites.map((favorite) => (
          <div
            key={favorite.url}
            className="group flex items-center gap-2 rounded-md border bg-white p-2 dark:bg-background-night"
          >
            <Chip size="xs" color="primary">
              {favorite.data.type}
            </Chip>
            <Link href={favorite.url} className="text-sm">
              {favorite.data.name}
            </Link>
            <IconButton
              icon={XMarkIcon}
              onClick={() => removeFavorite(favorite.url)}
              size="xs"
              tooltip="Remove from favorites"
            />
          </div>
        ))}
        {shouldCollapse && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="rounded-md border bg-white p-1 text-sm"
          >
            {isExpanded ? "Show less" : `+${hiddenCount} more`}
          </button>
        )}
      </div>
    </div>
  );
}
