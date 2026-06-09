import { createPersistentArrayStore } from "@app/poke/swr/persistentArrayStore";
import { useCallback } from "react";

const POKE_FAVORITES_KEY = "poke-favorites";

// Favorite entity types in display order; also the source of the PokeFavoriteType union.
export const POKE_FAVORITE_TYPES = [
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
] as const;

export type PokeFavoriteType = (typeof POKE_FAVORITE_TYPES)[number];

export interface PokeFavorite {
  url: string;
  data: {
    type: PokeFavoriteType;
    name: string;
    subtitle?: string;
    sId?: string;
  };
}

// Top-level poke pages (single URL segment) that are not workspaces.
const TOP_LEVEL_PAGES = new Set([
  "plans",
  "templates",
  "plugins",
  "kill",
  "cache",
  "pokefy",
  "production-checks",
  "global-agent-feedbacks",
  "coupons",
  "email-templates",
]);

/**
 * Strips query/hash and the optional `/poke` prefix, returning the path segments of a poke
 * URL. Poke workspace-scoped routes look like `/:wId/<section>/...`.
 */
function getPokeSegments(url: string): string[] {
  const path = url.split(/[?#]/)[0];
  const segments = path.split("/").filter(Boolean);
  return segments[0] === "poke" ? segments.slice(1) : segments;
}

/**
 * Infers a human-readable entity type from a poke URL by matching the known route shapes
 * defined in `front-spa/src/poke/routes.tsx`.
 */
export function inferTypeFromUrl(url: string): PokeFavoriteType {
  const segments = getPokeSegments(url);

  // Workspace-scoped routes: `/:wId/<section>/...`.
  if (segments.length >= 2) {
    const sections = segments.slice(1);
    if (sections.includes("triggers")) {
      return "Trigger";
    }
    switch (sections[0]) {
      case "assistants":
        return "Agent";
      case "spaces":
        if (sections.includes("data_source_views")) {
          return "Data Source View";
        }
        if (sections.includes("mcp_server_views")) {
          return "MCP Server";
        }
        if (sections.includes("apps")) {
          return "App";
        }
        return "Space";
      case "data_sources":
        return "Data Source";
      case "conversation":
        return "Conversation";
      case "llm-traces":
        return "LLM Trace";
      case "groups":
        return "Group";
      case "files":
        return "Frame";
      case "skills":
        return "Skill";
      case "suggestions":
        return "Skill Suggestion";
      case "webhook-sources":
        return "Webhook Source";
      case "memberships":
        return "Members";
      default:
        return "Page";
    }
  }

  // Single segment: either a bare workspace page or a top-level poke page.
  if (segments.length === 1) {
    return TOP_LEVEL_PAGES.has(segments[0]) ? "Page" : "Workspace";
  }

  return "Page";
}

interface CreateFavoriteOptions {
  type?: PokeFavoriteType;
  subtitle?: string;
  sId?: string;
}

export function createFavorite(
  url: string,
  name: string,
  options: CreateFavoriteOptions = {}
): PokeFavorite {
  return {
    url,
    data: {
      type: options.type ?? inferTypeFromUrl(url),
      name,
      subtitle: options.subtitle,
      sId: options.sId,
    },
  };
}

const favoritesStore =
  createPersistentArrayStore<PokeFavorite>(POKE_FAVORITES_KEY);

export function usePokeFavorites() {
  const favorites = favoritesStore.useItems();

  const addFavorite = useCallback((favorite: PokeFavorite) => {
    favoritesStore.setItems((prev) =>
      prev.some((f) => f.url === favorite.url) ? prev : [...prev, favorite]
    );
  }, []);

  const removeFavorite = useCallback((url: string) => {
    favoritesStore.setItems((prev) => prev.filter((f) => f.url !== url));
  }, []);

  const isFavorite = useCallback(
    (url: string) => favorites.some((f) => f.url === url),
    [favorites]
  );

  const toggleFavorite = useCallback((favorite: PokeFavorite) => {
    favoritesStore.setItems((prev) =>
      prev.some((f) => f.url === favorite.url)
        ? prev.filter((f) => f.url !== favorite.url)
        : [...prev, favorite]
    );
  }, []);

  return {
    favorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    toggleFavorite,
  };
}
