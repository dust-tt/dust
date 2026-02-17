import type { RegionInfo } from "@app/lib/api/regions/config";
import { setBaseUrlResolver } from "@app/lib/egress/client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSWRConfig } from "swr";

const STORAGE_KEY =
  import.meta.env?.VITE_DUST_REGION_STORAGE_KEY ?? "dust-region-api";

const DEFAULT_URL = import.meta.env?.VITE_DUST_CLIENT_FACING_URL ?? "";

function getStoredRegionInfo(): RegionInfo | null {
  const stored = localStorage.getItem(STORAGE_KEY);

  try {
    return stored && JSON.parse(stored);
  } catch {
    // Invalid JSON, return null.
    return null;
  }
}

function setStoredRegionInfo({ name, url }: RegionInfo): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, url }));
}

export interface RegionContextValue {
  regionInfo: RegionInfo | null;
  setRegionInfo: (regionInfo: RegionInfo) => void;
  isReady: boolean;
}

const RegionContext = createContext<RegionContextValue | null>(null);

export function RegionProvider({ children }: { children: React.ReactNode }) {
  const { mutate } = useSWRConfig();
  const [currentRegionInfo, setCurrentRegionInfo] = useState<RegionInfo | null>(
    null
  );
  const [isReady, setIsReady] = useState(false);

  // Store the current URL to use in the resolver.
  const currentUrlRef = useRef<string>(DEFAULT_URL);

  // On mount, restore region and URLs from localStorage.
  useEffect(() => {
    const storedRegionInfo = getStoredRegionInfo();

    if (storedRegionInfo) {
      setCurrentRegionInfo(storedRegionInfo);
      currentUrlRef.current = storedRegionInfo.url;
    }

    // Set up resolver that reads from ref (so it always gets latest value).
    // When the ref is undefined, getApiBaseUrl() will fallback to VITE_DUST_CLIENT_FACING_URL.
    setBaseUrlResolver(() => {
      return currentUrlRef.current;
    });
    setIsReady(true);

    return () => {
      setBaseUrlResolver(null);
      currentUrlRef.current = DEFAULT_URL;
    };
  }, []);

  // Manual region switch.
  const setRegionInfo = useCallback(
    (regionInfo: RegionInfo) => {
      // Update ref synchronously before anything else.
      currentUrlRef.current = regionInfo.url;

      // Update state and storage.
      setStoredRegionInfo(regionInfo);
      setCurrentRegionInfo(regionInfo);

      // Invalidate all SWR cache to refetch with new region.
      void mutate(() => true, undefined, { revalidate: true });
    },
    [mutate]
  );

  const value = useMemo(
    () => ({
      regionInfo: currentRegionInfo,
      setRegionInfo,
      isReady,
    }),
    [currentRegionInfo, setRegionInfo, isReady]
  );

  return (
    <RegionContext.Provider value={value}>
      {isReady && children}
    </RegionContext.Provider>
  );
}

export function useRegionContext(): RegionContextValue {
  const context = useContext(RegionContext);
  if (!context) {
    throw new Error("useRegionContext must be used within a RegionProvider");
  }
  return context;
}

export function useRegionContextSafe(): RegionContextValue | null {
  return useContext(RegionContext);
}
