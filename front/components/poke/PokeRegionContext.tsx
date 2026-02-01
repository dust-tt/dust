import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSWRConfig } from "swr";

import type { RegionType } from "@app/lib/api/regions/config";
import { isRegionType } from "@app/lib/api/regions/config";
import { setBaseUrlResolver } from "@app/lib/egress/client";
import { usePokeRegion as usePokeRegionSWR } from "@app/lib/swr/poke";

// Poke allows manual region switching via a dropdown. The selected region is persisted
// in localStorage so it survives page refreshes. This overrides the default region
// returned by the API, allowing admins to query data from either region.
const STORAGE_KEY = "poke-region-override";

function getStoredRegion(): RegionType | null {
  const stored = localStorage.getItem(STORAGE_KEY);

  return stored && isRegionType(stored) ? stored : null;
}

function setStoredRegion(region: RegionType | null): void {
  if (region) {
    localStorage.setItem(STORAGE_KEY, region);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

interface PokeRegionContextValue {
  currentRegion: RegionType | null;
  setRegion: (region: RegionType) => void;
  isLoading: boolean;
}

const PokeRegionContext = createContext<PokeRegionContextValue | null>(null);

export function PokeRegionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { mutate } = useSWRConfig();
  const { regionData, isRegionLoading } = usePokeRegionSWR();
  const [override, setOverride] = useState<RegionType | null>(getStoredRegion);

  const regionUrls = regionData?.regionUrls ?? null;
  const currentRegion = override ?? regionData?.region ?? null;

  // Set up the base URL resolver for clientFetch.
  useEffect(() => {
    setBaseUrlResolver(() => {
      if (override && regionUrls?.[override]) {
        return regionUrls[override];
      }
      return import.meta.env?.VITE_DUST_CLIENT_FACING_URL ?? "";
    });

    return () => setBaseUrlResolver(null);
  }, [override, regionUrls]);

  const setRegion = useCallback(
    (region: RegionType) => {
      setStoredRegion(region);
      setOverride(region);

      // Update resolver synchronously BEFORE clearing cache to avoid race condition
      setBaseUrlResolver(() => {
        if (regionUrls?.[region]) {
          return regionUrls[region];
        }
        return import.meta.env?.VITE_DUST_CLIENT_FACING_URL ?? "";
      });

      void mutate(() => true, undefined, { revalidate: true });
    },
    [mutate, regionUrls]
  );

  const value = useMemo(
    () => ({ currentRegion, setRegion, isLoading: isRegionLoading }),
    [currentRegion, setRegion, isRegionLoading]
  );

  return (
    <PokeRegionContext.Provider value={value}>
      {children}
    </PokeRegionContext.Provider>
  );
}

export function usePokeRegionContext(): PokeRegionContextValue {
  const context = useContext(PokeRegionContext);
  if (!context) {
    throw new Error(
      "usePokeRegionContext must be used within a PokeRegionProvider"
    );
  }

  return context;
}

export function usePokeRegionContextSafe(): PokeRegionContextValue | null {
  return useContext(PokeRegionContext);
}
