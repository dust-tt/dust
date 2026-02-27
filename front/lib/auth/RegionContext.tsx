import { setBaseUrlResolver } from "@app/lib/api/config";
import type { RegionInfo, RegionType } from "@app/lib/api/regions/config";
import { isRegionType } from "@app/lib/api/regions/config";
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

const DEFAULT_REGION: RegionType =
  (import.meta.env?.VITE_DUST_REGION as RegionType) ?? "us-central1";

const DEFAULT_REGION_INFO: RegionInfo = {
  name: DEFAULT_REGION,
  url: DEFAULT_URL,
};

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
  regionInfo: RegionInfo;
  setRegionInfo: (
    regionInfo: RegionInfo,
    options?: { keepInStorage?: boolean }
  ) => void;
}

const RegionContext = createContext<RegionContextValue | null>(null);

export function RegionProvider({ children }: { children: React.ReactNode }) {
  const { mutate } = useSWRConfig();
  const [currentRegionInfo, setCurrentRegionInfo] =
    useState<RegionInfo>(DEFAULT_REGION_INFO);
  const [isReady, setIsReady] = useState(false);

  // Store the current URL to use in the resolver.
  const currentUrlRef = useRef<string>(DEFAULT_URL);

  // On mount, restore region from URL params (post-login) or localStorage.
  useEffect(() => {
    let regionInfo: RegionInfo | null = null;

    // Check URL params first (set by /api/login after authentication).
    const params = new URLSearchParams(window.location.search);
    const region = params.get("region");
    const regionUrl = params.get("regionUrl");

    if (region && regionUrl && isRegionType(region)) {
      regionInfo = { name: region, url: regionUrl };
      setStoredRegionInfo(regionInfo);

      // Clean region params from URL.
      params.delete("region");
      params.delete("regionUrl");
      const qs = params.toString();
      const newUrl =
        window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState(null, "", newUrl);
    } else {
      regionInfo = getStoredRegionInfo();
    }

    const resolvedRegionInfo = regionInfo ?? DEFAULT_REGION_INFO;
    setCurrentRegionInfo(resolvedRegionInfo);
    currentUrlRef.current = resolvedRegionInfo.url;

    // Set up resolver that reads from ref (so it always gets latest value).
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
    (regionInfo: RegionInfo, options?: { keepInStorage?: boolean }) => {
      // Update ref synchronously before anything else.
      currentUrlRef.current = regionInfo.url;

      // Update state and storage.
      if (options?.keepInStorage) {
        setStoredRegionInfo(regionInfo);
      }
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
    }),
    [currentRegionInfo, setRegionInfo]
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

export function useOptionalRegionContext(): RegionContextValue | null {
  return useContext(RegionContext);
}
