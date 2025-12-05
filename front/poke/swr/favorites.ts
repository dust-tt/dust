import { useCallback, useSyncExternalStore } from "react";

const POKE_FAVORITES_KEY = "poke-favorites";

// Store for useSyncExternalStore pattern.
let listeners: Array<() => void> = [];
let cachedFavorites: PokeFavorite[] | null = null;

function subscribe(callback: () => void) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

function getSnapshot(): PokeFavorite[] {
  cachedFavorites ??= getFavoritesFromStorageInternal();
  return cachedFavorites;
}

function getServerSnapshot(): PokeFavorite[] {
  return EMPTY_FAVORITES;
}

function notifyListeners() {
  cachedFavorites = getFavoritesFromStorageInternal();
  listeners.forEach((l) => l());
}

function getFavoritesFromStorageInternal(): PokeFavorite[] {
  try {
    const stored = localStorage.getItem(POKE_FAVORITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export interface PokeFavorite {
  url: string;
  data: {
    type: string;
    name: string;
  };
}

// Cached empty array for server snapshot to avoid infinite loops.
const EMPTY_FAVORITES: PokeFavorite[] = [];

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

function saveFavoritesToStorage(favorites: PokeFavorite[]): void {
  try {
    localStorage.setItem(POKE_FAVORITES_KEY, JSON.stringify(favorites));
    notifyListeners();
  } catch {
    // Silently fail if localStorage is not available
  }
}

export function usePokeFavorites() {
  // useSyncExternalStore handles hydration correctly:
  // - Server uses getServerSnapshot (empty array)
  // - Client uses getSnapshot (localStorage data)
  // - React handles the mismatch gracefully
  const favorites = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const addFavorite = useCallback((favorite: PokeFavorite) => {
    const current = getSnapshot();
    if (current.some((f) => f.url === favorite.url)) {
      return;
    }
    saveFavoritesToStorage([...current, favorite]);
  }, []);

  const removeFavorite = useCallback((url: string) => {
    const current = getSnapshot();
    saveFavoritesToStorage(current.filter((f) => f.url !== url));
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
