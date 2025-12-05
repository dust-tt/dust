import { useCallback, useState } from "react";

const POKE_FAVORITES_KEY = "poke-favorites";

interface PokeFavorite {
  url: string;
  data: {
    type: string;
    name: string;
  };
}

function inferTypeFromUrl(url: string): string {
  if (url.includes("/assistants/")) {
    return "Agent";
  }
  if (url.includes("/data_source_views/")) {
    return "Data Source View";
  }
  if (url.includes("/data_sources/")) {
    return "Data Source";
  }
  if (url.includes("/triggers/")) {
    return "Trigger";
  }
  if (url.includes("/spaces/")) {
    return "Space";
  }
  if (url.includes("/conversations/")) {
    return "Conversation";
  }
  if (url.includes("/plugins/")) {
    return "Plugin";
  }
  if (url.includes("/memberships")) {
    return "Members";
  }
  if (url.includes("/groups/")) {
    return "Group";
  }
  if (url.includes("/mcp_server_views/")) {
    return "MCP Server";
  }
  if (url.includes("/apps/")) {
    return "App";
  }
  if (url.match(/\/poke\/[^/]+$/)) {
    return "Workspace";
  }
  return "Page";
}

export function createFavorite(url: string, name: string): PokeFavorite {
  return {
    url,
    data: {
      type: inferTypeFromUrl(url),
      name,
    },
  };
}

function getFavoritesFromStorage(): PokeFavorite[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const stored = localStorage.getItem(POKE_FAVORITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveFavoritesToStorage(favorites: PokeFavorite[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(POKE_FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    // Silently fail if localStorage is not available
  }
}

export function usePokeFavorites() {
  const [favorites, setFavorites] = useState<PokeFavorite[]>(
    getFavoritesFromStorage
  );

  const addFavorite = useCallback((favorite: PokeFavorite) => {
    setFavorites((prev) => {
      // Don't add duplicates
      if (prev.some((f) => f.url === favorite.url)) {
        return prev;
      }
      const updated = [...prev, favorite];
      saveFavoritesToStorage(updated);
      return updated;
    });
  }, []);

  const removeFavorite = useCallback((url: string) => {
    setFavorites((prev) => {
      const updated = prev.filter((f) => f.url !== url);
      saveFavoritesToStorage(updated);
      return updated;
    });
  }, []);

  const isFavorite = useCallback(
    (url: string) => {
      return favorites.some((f) => f.url === url);
    },
    [favorites]
  );

  const toggleFavorite = useCallback(
    (favorite: PokeFavorite) => {
      if (isFavorite(favorite.url)) {
        removeFavorite(favorite.url);
      } else {
        addFavorite(favorite);
      }
    },
    [isFavorite, removeFavorite, addFavorite]
  );

  return {
    favorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    toggleFavorite,
  };
}
