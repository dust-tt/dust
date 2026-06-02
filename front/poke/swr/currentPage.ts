import { useAppRouter } from "@app/lib/platform";
import {
  createExternalStore,
  useExternalStore,
} from "@app/poke/swr/externalStore";
import type { PokeFavorite, PokeFavoriteType } from "@app/poke/swr/favorites";
import { createFavorite } from "@app/poke/swr/favorites";
import { useEffect } from "react";

// Metadata for the poke page currently shown. Not persisted — it only feeds the navbar
// favorite button so it can capture rich data instead of parsing `document.title`.
const store = createExternalStore<PokeFavorite | null>(null);

export function useCurrentPage(): PokeFavorite | null {
  return useExternalStore(store, () => null);
}

interface PokePageMetadataInput {
  // null/undefined while the entity is still loading; nothing is published until set.
  name: string | null | undefined;
  type?: PokeFavoriteType;
  subtitle?: string;
  sId?: string;
  title?: string;
}

// Replaces `useDocumentTitle` in poke: sets the tab title and publishes page metadata to the
// store. Self-gates on `name`, so it stays silent until the page's data has loaded.
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
