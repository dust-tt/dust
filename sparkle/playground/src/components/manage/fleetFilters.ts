import { useCallback, useEffect, useState } from "react";

import { totalUsage } from "../../data/fleetUsage";
import type { FleetUsage } from "../../data/fleetUsage";
import { compareForFuzzySort, subFilter } from "./utils";

// One filter model for both fleet screens. In the product this would be a
// query string parsed server-side; here the same shape drives an in-memory
// predicate so the port stays mechanical.

// Publication state — "which ones are validated". Archived is deliberately not
// a value here: the Archived tab already is that filter, and offering both
// produced contradictory states (status=archived returned nothing on every
// tab, including Archived).
export type PublicationFilterValue = "published" | "unpublished";

export type EditedWithinValue = "7d" | "30d" | "stale_180d";

export type NotUsedForValue = "30d" | "90d" | "never";

/**
 * One dimension per question the fleet brief says an admin must be able to
 * answer: who owns it (editors), what it depends on (tools), which ones are
 * validated (publication, availability), what changed (editedWithin), where
 * it is used (notUsedFor). Model and tags are agent-specific additions the
 * brief calls for explicitly.
 */
export interface FleetFilters {
  search: string;
  editors: string[];
  tools: string[];
  // Agents only; skills express the same idea through availability.
  publication: PublicationFilterValue[];
  models: string[];
  tags: string[];
  // Skills only: mirrors the availability dropdown next to the tabs.
  availability: string[];
  editedWithin: EditedWithinValue | null;
  notUsedFor: NotUsedForValue | null;
}

export const EMPTY_FLEET_FILTERS: FleetFilters = {
  search: "",
  editors: [],
  tools: [],
  publication: [],
  models: [],
  tags: [],
  availability: [],
  editedWithin: null,
  notUsedFor: null,
};

// Two directions only: recently touched, or gone stale. Intermediate windows
// added options without adding answers.
export const EDITED_WITHIN_OPTIONS: {
  value: EditedWithinValue;
  label: string;
}[] = [
  { value: "7d", label: "Edited in the last 7 days" },
  { value: "30d", label: "Edited in the last 30 days" },
  { value: "stale_180d", label: "Not edited in 6 months" },
];

export const NOT_USED_FOR_OPTIONS: {
  value: NotUsedForValue;
  label: string;
}[] = [
  { value: "30d", label: "No human use in 30 days" },
  { value: "90d", label: "No human use in 90 days" },
  { value: "never", label: "Never used, any origin" },
];

export const PUBLICATION_OPTIONS: {
  value: PublicationFilterValue;
  label: string;
}[] = [
  { value: "published", label: "Published" },
  { value: "unpublished", label: "Not published" },
];

// ── Predicate ─────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** The subset of an agent or a skill the filters actually read. */
export interface FleetItemFields {
  name: string;
  editorIds: string[];
  editorNames: string[];
  tools: string[];
  // null on skills, which use availability instead.
  publication: PublicationFilterValue | null;
  modelId: string | null;
  tagIds: string[];
  updatedAt: number;
  usage: FleetUsage | null;
}

function searchStringFor(fields: FleetItemFields): string {
  return [fields.name, ...fields.editorNames].join(" ").toLowerCase();
}

function matchesEditedWithin(
  updatedAt: number,
  value: EditedWithinValue,
  nowMs: number
): boolean {
  const ageMs = nowMs - updatedAt;
  switch (value) {
    case "7d":
      return ageMs <= 7 * DAY_MS;
    case "30d":
      return ageMs <= 30 * DAY_MS;
    case "stale_180d":
      return ageMs > 180 * DAY_MS;
  }
}

function matchesNotUsedFor(
  usage: FleetUsage | null,
  value: NotUsedForValue,
  nowMs: number
): boolean {
  // System items report no usage at all — they are never archiving candidates.
  if (!usage) {
    return false;
  }
  if (value === "never") {
    return totalUsage(usage) === 0 && usage.lastUsedAt === null;
  }
  const days = value === "30d" ? 30 : 90;
  // Deliberately reads `lastHumanUsedAt`, not `lastUsedAt`: an agent kept warm
  // only by an API integration is still one nobody talks to. The programmatic
  // and agent-to-agent indicators stay visible on the row so the dependency is
  // obvious before anyone archives it.
  return (
    usage.lastHumanUsedAt === null ||
    nowMs - usage.lastHumanUsedAt > days * DAY_MS
  );
}

/**
 * Counts what the Filters button badges — every dimension the menu owns.
 * Availability is excluded: it keeps its own control next to the tabs.
 */
export function countActiveFleetFilters(filters: FleetFilters): number {
  return (
    filters.editors.length +
    filters.tools.length +
    filters.publication.length +
    filters.models.length +
    filters.tags.length +
    (filters.editedWithin ? 1 : 0) +
    (filters.notUsedFor ? 1 : 0)
  );
}

/**
 * Applies every filter dimension. Each one is a plain AND, which is what makes
 * the dimensions combinable: "published agents using Salesforce, not used in
 * 60 days" is just three predicates.
 */
export function filterFleet<T>(
  items: T[],
  filters: FleetFilters,
  select: (item: T) => FleetItemFields,
  nowMs: number
): T[] {
  const editorIds = new Set(filters.editors);
  const toolIds = new Set(filters.tools);
  const publications = new Set(filters.publication);
  const modelIds = new Set(filters.models);
  const tagIds = new Set(filters.tags);

  const searchLower = filters.search.trim().toLowerCase();
  const isSearchActive = searchLower.length > 0;

  const matched = items.filter((item) => {
    const fields = select(item);

    if (
      editorIds.size > 0 &&
      !fields.editorIds.some((id) => editorIds.has(id))
    ) {
      return false;
    }
    if (toolIds.size > 0 && !fields.tools.some((tool) => toolIds.has(tool))) {
      return false;
    }
    if (
      publications.size > 0 &&
      (fields.publication === null || !publications.has(fields.publication))
    ) {
      return false;
    }
    if (
      modelIds.size > 0 &&
      (fields.modelId === null || !modelIds.has(fields.modelId))
    ) {
      return false;
    }
    if (tagIds.size > 0 && !fields.tagIds.some((tag) => tagIds.has(tag))) {
      return false;
    }
    if (
      filters.editedWithin &&
      !matchesEditedWithin(fields.updatedAt, filters.editedWithin, nowMs)
    ) {
      return false;
    }
    if (
      filters.notUsedFor &&
      !matchesNotUsedFor(fields.usage, filters.notUsedFor, nowMs)
    ) {
      return false;
    }
    if (isSearchActive && !subFilter(searchLower, searchStringFor(fields))) {
      return false;
    }
    return true;
  });

  if (!isSearchActive) {
    return matched;
  }

  return matched.sort((a, b) =>
    compareForFuzzySort(
      searchLower,
      searchStringFor(select(a)),
      searchStringFor(select(b))
    )
  );
}

// ── URL state ─────────────────────────────────────────────────────────────────

const LIST_KEYS = [
  "editors",
  "tools",
  "publication",
  "models",
  "tags",
  "availability",
] as const;

export function fleetFiltersToSearchParams(
  filters: FleetFilters,
  extra: Record<string, string | undefined> = {}
): string {
  const params = new URLSearchParams();
  if (filters.search.trim()) {
    params.set("q", filters.search.trim());
  }
  for (const key of LIST_KEYS) {
    const values = filters[key];
    if (values.length > 0) {
      params.set(key, values.join(","));
    }
  }
  if (filters.editedWithin) {
    params.set("editedWithin", filters.editedWithin);
  }
  if (filters.notUsedFor) {
    params.set("notUsedFor", filters.notUsedFor);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value) {
      params.set(key, value);
    }
  }
  return params.toString();
}

function parseList(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  return raw ? raw.split(",").filter((value) => value.length > 0) : [];
}

export function fleetFiltersFromSearchParams(
  params: URLSearchParams
): FleetFilters {
  const editedWithin = params.get("editedWithin");
  const notUsedFor = params.get("notUsedFor");

  return {
    search: params.get("q") ?? "",
    editors: parseList(params, "editors"),
    tools: parseList(params, "tools"),
    publication: parseList(params, "publication") as PublicationFilterValue[],
    models: parseList(params, "models"),
    tags: parseList(params, "tags"),
    availability: parseList(params, "availability"),
    editedWithin: EDITED_WITHIN_OPTIONS.some((o) => o.value === editedWithin)
      ? (editedWithin as EditedWithinValue)
      : null,
    notUsedFor: NOT_USED_FOR_OPTIONS.some((o) => o.value === notUsedFor)
      ? (notUsedFor as NotUsedForValue)
      : null,
  };
}

/**
 * Keeps the filter state in the query string so a filtered fleet view can be
 * shared or bookmarked. Uses `replaceState` to avoid stacking one history
 * entry per keystroke; the story name stays in the hash, untouched.
 */
export function useFleetFilters(
  extra: Record<string, string | undefined> = {}
) {
  const [filters, setFilters] = useState<FleetFilters>(() =>
    typeof window === "undefined"
      ? EMPTY_FLEET_FILTERS
      : fleetFiltersFromSearchParams(
          new URLSearchParams(window.location.search)
        )
  );

  const serializedExtra = JSON.stringify(extra);

  useEffect(() => {
    const query = fleetFiltersToSearchParams(
      filters,
      JSON.parse(serializedExtra)
    );
    const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", url);
  }, [filters, serializedExtra]);

  useEffect(() => {
    const onPopState = () => {
      setFilters(
        fleetFiltersFromSearchParams(
          new URLSearchParams(window.location.search)
        )
      );
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const updateFilters = useCallback((update: Partial<FleetFilters>) => {
    setFilters((current) => ({ ...current, ...update }));
  }, []);

  const toggleValue = useCallback(
    (
      key: (typeof LIST_KEYS)[number],
      value: string,
      { exclusive }: { exclusive?: boolean } = {}
    ) => {
      setFilters((current) => {
        // The list dimensions hold different literal unions; they are all
        // string arrays at runtime, and the option lists are the only writers.
        const values: string[] = current[key];
        if (exclusive) {
          return {
            ...current,
            [key]: values.includes(value) ? [] : [value],
          };
        }
        return {
          ...current,
          [key]: values.includes(value)
            ? values.filter((v) => v !== value)
            : [...values, value],
        };
      });
    },
    []
  );

  const clearFilters = useCallback(() => {
    setFilters((current) => ({
      ...EMPTY_FLEET_FILTERS,
      search: current.search,
    }));
  }, []);

  return { filters, setFilters, updateFilters, toggleValue, clearFilters };
}
