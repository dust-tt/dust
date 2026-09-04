import { setBaseUrlResolver } from "@app/lib/api/config";
import type { CellInfo, CellType } from "@app/types/cell";
import { CellInfoSchema, isCellType, SUPPORTED_CELLS } from "@app/types/cell";
import type { RegionType } from "@app/types/region";
import { isRegionType } from "@app/types/region";
import { assertNever } from "@app/types/shared/utils/assert_never";
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
  import.meta.env?.VITE_DUST_CELL_STORAGE_KEY ?? "dust-cell-api";

const LEGACY_REGION_STORAGE_KEY =
  import.meta.env?.VITE_DUST_REGION_STORAGE_KEY ?? "dust-region-api";

const DEFAULT_URL = import.meta.env?.VITE_DUST_API_URL ?? "";

const DEFAULT_CELL: CellType = isCellType(import.meta.env?.VITE_DUST_CELL ?? "")
  ? (import.meta.env?.VITE_DUST_CELL as CellType)
  : "cell-00000";

// Client-side cell catalog — mirrors front/lib/api/cells/config.ts CELLS, but
// resolves URLs from Vite env (VITE_DUST_API_URL_US / _EU) instead of server env.
function getCellInfo(cell: CellType): CellInfo {
  switch (cell) {
    case "cell-00000":
      return {
        name: cell,
        region: "us-central1",
        url: import.meta.env?.VITE_DUST_API_URL_US ?? DEFAULT_URL,
      };
    case "cell-00001":
      return {
        name: cell,
        region: "europe-west1",
        url: import.meta.env?.VITE_DUST_API_URL_EU ?? DEFAULT_URL,
      };
    default:
      assertNever(cell);
  }
}

function getAllCells(): CellInfo[] {
  return SUPPORTED_CELLS.map((cell) => getCellInfo(cell));
}

const DEFAULT_CELL_INFO: CellInfo = getCellInfo(DEFAULT_CELL);

function getStoredCellName(): CellType | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    if (typeof parsed === "string" && isCellType(parsed)) {
      return parsed;
    }
    const cellInfo = CellInfoSchema.safeParse(parsed);
    if (cellInfo.success) {
      return cellInfo.data.name;
    }
  } catch {
    console.error("Invalid cell info JSON", stored);
  }
  return null;
}

function getLegacyStoredRegion(): RegionType | null {
  const stored = localStorage.getItem(LEGACY_REGION_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const regionInfo = JSON.parse(stored);
    if (
      typeof regionInfo === "object" &&
      regionInfo !== null &&
      "name" in regionInfo &&
      typeof regionInfo.name === "string" &&
      isRegionType(regionInfo.name)
    ) {
      return regionInfo.name;
    }
    return null;
  } catch {
    return null;
  }
}

function setStoredCellInfo(info: CellInfo): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
}

function findCellByRegion(region: RegionType): CellInfo | null {
  return getAllCells().find((c) => c.region === region) ?? null;
}

function readAndClearLegacyRegionUrlParam(): RegionType | null {
  const params = new URLSearchParams(window.location.search);
  const region = params.get("region");
  if (!region || !isRegionType(region)) {
    return null;
  }

  params.delete("region");
  const qs = params.toString();
  const newUrl =
    window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
  window.history.replaceState(null, "", newUrl);
  return region;
}

function readAndClearCellUrlParam(): CellType | null {
  const params = new URLSearchParams(window.location.search);
  const cell = params.get("cell");
  if (!cell || !isCellType(cell)) {
    return null;
  }

  params.delete("cell");
  const qs = params.toString();
  const newUrl =
    window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
  window.history.replaceState(null, "", newUrl);
  return cell;
}

interface CellContextValue {
  cellInfo: CellInfo;
  cells: CellInfo[];
  setCellInfo: (
    cellInfo: CellInfo,
    options?: { keepInStorage?: boolean }
  ) => void;
}

const CellContext = createContext<CellContextValue | null>(null);

export function CellProvider({ children }: { children: React.ReactNode }) {
  const { mutate } = useSWRConfig();
  const [currentCellInfo, setCurrentCellInfo] =
    useState<CellInfo>(DEFAULT_CELL_INFO);
  const [isReady, setIsReady] = useState(false);

  const currentUrlRef = useRef<string>(DEFAULT_URL);

  // On mount, restore cell from URL params (post-login) or localStorage.
  useEffect(() => {
    let cellInfo: CellInfo | null = null;

    const cellFromUrl = readAndClearCellUrlParam();
    if (cellFromUrl) {
      cellInfo = getCellInfo(cellFromUrl);
      setStoredCellInfo(cellInfo);
    } else {
      // Backward compatibility for old links with ?region= instead of ?cell=.
      const regionFromUrl = readAndClearLegacyRegionUrlParam();
      if (regionFromUrl) {
        cellInfo = findCellByRegion(regionFromUrl);
        if (cellInfo) {
          setStoredCellInfo(cellInfo);
        }
      } else {
        const storedCell = getStoredCellName();
        if (storedCell) {
          cellInfo = getCellInfo(storedCell);
        } else {
          // Backward compatibility for old browsers with region in localStorage.
          const legacyRegion = getLegacyStoredRegion();
          if (legacyRegion) {
            cellInfo = findCellByRegion(legacyRegion);
          }
        }
      }
    }

    const resolvedCellInfo = cellInfo ?? DEFAULT_CELL_INFO;
    setCurrentCellInfo(resolvedCellInfo);
    currentUrlRef.current = resolvedCellInfo.url;

    setBaseUrlResolver(() => currentUrlRef.current);
    setIsReady(true);

    return () => {
      setBaseUrlResolver(null);
      currentUrlRef.current = DEFAULT_URL;
    };
  }, []);

  const setCellInfo = useCallback(
    (cellInfo: CellInfo, options?: { keepInStorage?: boolean }) => {
      currentUrlRef.current = cellInfo.url;

      if (options?.keepInStorage) {
        setStoredCellInfo(cellInfo);
      }
      setCurrentCellInfo(cellInfo);

      void mutate(() => true, undefined, { revalidate: true });
    },
    [mutate]
  );

  const value = useMemo(
    () => ({
      cellInfo: currentCellInfo,
      cells: getAllCells(),
      setCellInfo,
    }),
    [currentCellInfo, setCellInfo]
  );

  return (
    <CellContext.Provider value={value}>
      {isReady && children}
    </CellContext.Provider>
  );
}

export function useCellContext(): CellContextValue {
  const context = useContext(CellContext);
  if (!context) {
    throw new Error("useCellContext must be used within a CellProvider");
  }
  return context;
}
