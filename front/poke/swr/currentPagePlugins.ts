import type { PluginListItem } from "@app/lib/api/poke/types";
import {
  createExternalStore,
  useExternalStore,
} from "@app/poke/swr/externalStore";
import { useEffect } from "react";

interface CurrentPagePlugins {
  plugins: PluginListItem[];
  onSelect: (plugin: PluginListItem) => void;
}

const store = createExternalStore<CurrentPagePlugins | null>(null);

export function useCurrentPagePlugins(): CurrentPagePlugins | null {
  return useExternalStore(store, () => null);
}

export function usePublishCurrentPagePlugins(
  plugins: PluginListItem[],
  onSelect: (plugin: PluginListItem) => void
): void {
  useEffect(() => {
    store.setSnapshot({ plugins, onSelect });

    return () => {
      store.setSnapshot(null);
    };
  }, [plugins, onSelect]);
}
