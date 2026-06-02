import { useAppRouter } from "@app/lib/platform";
import {
  createExternalStore,
  useExternalStore,
} from "@app/poke/swr/externalStore";
import type { PokeFavorite, PokeFavoriteType } from "@app/poke/swr/favorites";
import { createFavorite } from "@app/poke/swr/favorites";
import { useEffect } from "react";

/**
 * In-memory, single-value store describing the poke page currently shown. It is
 * intentionally NOT persisted: it only reflects the live page so the navbar favorite button
 * can capture rich metadata (real entity name, sId, workspace) instead of parsing
 * `document.title`.
 */
const store = createExternalStore<PokeFavorite | null>(null);

/** Reads the metadata published by the page currently shown, or `null` if none/loading. */
export function useCurrentPage(): PokeFavorite | null {
  return useExternalStore(store, () => null);
}

interface PokePageMetadataInput {
  // The entity display name. `null`/`undefined` means "still loading" — nothing is published
  // until a real name is available, so favorites never capture a placeholder.
  name: string | null | undefined;
  // Entity type for the favorite chip; defaults to `inferTypeFromUrl(url)`.
  type?: PokeFavoriteType;
  // Secondary context line, typically the workspace name.
  subtitle?: string;
  // The entity's own string identifier.
  sId?: string;
  // Optional `document.title` override; defaults to `Poke - <name> · <subtitle>`.
  title?: string;
}

/**
 * Publishes structured metadata about the current poke page. Replaces `useDocumentTitle`:
 * it sets `document.title` AND records the page in the in-memory store so the favorite
 * button can read it. Runs on every render so it reacts to entity data arriving via SWR;
 * it self-gates on `name` and publishes nothing while the page is still loading.
 */
export function usePokePageMetadata({
  name,
  type,
  subtitle,
  sId,
  title,
}: PokePageMetadataInput): void {
  const router = useAppRouter();
  const url = router.asPath;

  useEffect(() => {
    if (!name) {
      return;
    }

    const prevTitle = document.title;
    document.title =
      title ?? `Poke - ${[name, subtitle].filter(Boolean).join(" · ")}`;
    store.setSnapshot(createFavorite(url, name, { type, subtitle, sId }));

    return () => {
      document.title = prevTitle;
      store.setSnapshot(null);
    };
  }, [url, name, type, subtitle, sId, title]);
}
