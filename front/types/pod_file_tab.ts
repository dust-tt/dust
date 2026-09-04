import type { CustomResourceIconType } from "@app/components/resources/resources_icon_names";
import { isCustomResourceIconType } from "@app/components/resources/resources_icon_names";
import { z } from "zod";

export const MAX_POD_FILE_TABS = 8;
export const MAX_POD_FILE_TAB_TITLE_LENGTH = 64;
export const DEFAULT_POD_FILE_TAB_ICON =
  "ActionDashboardIcon" satisfies CustomResourceIconType;

/** System tabs that participate in ordering (Settings is always last and excluded). */
export const POD_NAV_SYSTEM_TABS_BEFORE_SETTINGS = [
  "conversations",
  "tasks",
  "files",
  "connected_data",
] as const;

export type PodNavSystemTabBeforeSettings =
  (typeof POD_NAV_SYSTEM_TABS_BEFORE_SETTINGS)[number];

const POD_NAV_SYSTEM_TAB_SET = new Set<string>(
  POD_NAV_SYSTEM_TABS_BEFORE_SETTINGS
);

export function isPodNavSystemTabBeforeSettings(
  value: string
): value is PodNavSystemTabBeforeSettings {
  return POD_NAV_SYSTEM_TAB_SET.has(value);
}

export const PodFileTabSchema = z.object({
  path: z.string().min(1),
  title: z.string().min(1).max(MAX_POD_FILE_TAB_TITLE_LENGTH),
  icon: z.custom<CustomResourceIconType>(isCustomResourceIconType, {
    message: "Invalid icon.",
  }),
});

export type PodFileTab = z.infer<typeof PodFileTabSchema>;

export const PodFileTabsSchema = z
  .array(PodFileTabSchema)
  .max(MAX_POD_FILE_TABS);

/** Mixed list of system tab ids and file-tab paths (Settings is never included). */
export const PodTabsOrderSchema = z.array(z.string().min(1));

export type PodTabsOrder = z.infer<typeof PodTabsOrderSchema>;

export type PodNavItemBeforeSettings =
  | { kind: "system"; id: PodNavSystemTabBeforeSettings }
  | { kind: "file"; tab: PodFileTab };

export function sortPodFileTabs(tabs: PodFileTab[]): PodFileTab[] {
  return [...tabs].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Ensure tabsOrder contains every system tab + every file-tab path exactly once.
 * Unknown entries are dropped; missing ones are appended.
 */
export function normalizeTabsOrder(
  tabsOrder: string[] | null | undefined,
  fileTabPaths: string[]
): string[] {
  const fileTabPathSet = new Set(fileTabPaths);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of tabsOrder ?? []) {
    if (seen.has(entry)) {
      continue;
    }
    if (isPodNavSystemTabBeforeSettings(entry) || fileTabPathSet.has(entry)) {
      result.push(entry);
      seen.add(entry);
    }
  }

  for (const id of POD_NAV_SYSTEM_TABS_BEFORE_SETTINGS) {
    if (!seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }

  for (const path of fileTabPaths) {
    if (!seen.has(path)) {
      result.push(path);
      seen.add(path);
    }
  }

  return result;
}

/**
 * Which conditional system tabs this Pod currently shows. Connected Data depends on the Pod being
 * admin-controlled. This must be honoured everywhere tab order is computed, so neighbour-swapping
 * never moves a file tab past a tab the user cannot see.
 */
export type PodNavVisibility = {
  includeConnectedData: boolean;
};

/** Connected Data not shown — the safe default for callers that do not know yet. */
export const DEFAULT_POD_NAV_VISIBILITY: PodNavVisibility = {
  includeConnectedData: false,
};

export function visibleTabsOrder(
  tabsOrder: string[],
  { includeConnectedData }: PodNavVisibility
): string[] {
  return tabsOrder.filter((id) => {
    if (id === "connected_data") {
      return includeConnectedData;
    }
    return true;
  });
}

export function buildPodNavItemsBeforeSettings(
  fileTabs: PodFileTab[],
  tabsOrder: string[],
  visibility: PodNavVisibility
): PodNavItemBeforeSettings[] {
  const byPath = new Map(fileTabs.map((tab) => [tab.path, tab]));
  const normalized = normalizeTabsOrder(
    tabsOrder,
    fileTabs.map((tab) => tab.path)
  );
  const visible = visibleTabsOrder(normalized, visibility);

  const items: PodNavItemBeforeSettings[] = [];
  for (const entry of visible) {
    if (isPodNavSystemTabBeforeSettings(entry)) {
      items.push({ kind: "system", id: entry });
      continue;
    }
    const tab = byPath.get(entry);
    if (tab) {
      items.push({ kind: "file", tab });
    }
  }
  return items;
}

/** Swap a file tab with its visible neighbor (system or file tab). */
export function moveFileTabInTabsOrder(
  tabsOrder: string[],
  path: string,
  direction: "left" | "right",
  visibility: PodNavVisibility
): string[] | null {
  const visible = visibleTabsOrder(tabsOrder, visibility);
  const index = visible.indexOf(path);
  if (index < 0) {
    return null;
  }

  const swapWith = direction === "left" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= visible.length) {
    return null;
  }

  const a = visible[index];
  const b = visible[swapWith];
  const next = [...tabsOrder];
  const ai = next.indexOf(a);
  const bi = next.indexOf(b);
  if (ai < 0 || bi < 0) {
    return null;
  }
  next[ai] = b;
  next[bi] = a;
  return next;
}

export function podFileTabBasename(path: string): string {
  const base = path.split("/").pop() ?? path;
  // Strip the last extension for any previewable file (frames, .md, etc.).
  return base.replace(/\.[^.]+$/, "") || base;
}

/** Tab value / hash prefix remains `frame:` / `#frame/...` for existing deep links. */
export function makePodFileTabValue(path: string): string {
  return `frame:${path}`;
}

export function parsePodFileTabPath(tab: string): string | null {
  if (!tab.startsWith("frame:")) {
    return null;
  }
  const path = tab.slice("frame:".length);
  return path.length > 0 ? path : null;
}

export function isPodFileTabValue(tab: string): boolean {
  return parsePodFileTabPath(tab) !== null;
}
