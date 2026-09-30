import { isString } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { z } from "zod";

// The `useHashParam` key holding a page's tab and filters.
export const FILTER_HASH_PARAM = "search";

// Selected IDs mapped to their labels, per filter category.
export type FilterHashSelection<Category extends string> = Partial<
  Record<Category, Record<string, string>>
>;

export interface FilterHashState<
  Category extends string,
  TabId extends string,
> {
  tabId: TabId;
  selection: FilterHashSelection<Category>;
}

const filterHashSchema = z
  .object({
    tab: z.unknown().optional(),
    filter: z.record(z.unknown()).optional(),
  })
  .passthrough();

const selectedLabelsSchema = z.record(z.unknown());

// base64url of the UTF-8 bytes: the URL-safe alphabet needs no percent-encoding in the hash.
function toBase64Url(text: string): string {
  const binary = Array.from(new TextEncoder().encode(text), (byte) =>
    String.fromCharCode(byte)
  ).join("");
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): string | null {
  let binary: string;
  try {
    binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  return new TextDecoder().decode(
    Uint8Array.from(binary, (char) => char.charCodeAt(0))
  );
}

/**
 * @cc [owner:tdraier,label:react;security] parse-tolerates-untrusted-hash
 * The hash is user-controlled (shared links, manual edits): malformed base64 or JSON MUST yield
 * `defaultTabId`, no selection and no `fields`, an unknown tab MUST yield `defaultTabId`, and
 * invalid IDs, non-string labels or categories outside `categories` MUST be dropped individually
 * without discarding the other selections. Each category MUST keep at most `maxIdsPerCategory`
 * IDs. `fields` holds the other decoded keys unvalidated; callers MUST validate what they read.
 */
export function parseFilterHash<Category extends string, TabId extends string>(
  value: string | undefined,
  {
    categories,
    tabIds,
    defaultTabId,
    maxIdsPerCategory,
  }: {
    categories: readonly Category[];
    tabIds: readonly TabId[];
    defaultTabId: TabId;
    maxIdsPerCategory: number;
  }
): FilterHashState<Category, TabId> & { fields: Record<string, unknown> } {
  const text = value ? fromBase64Url(value) : null;
  const json = text ? safeParseJSON(text) : null;
  const parsed = json?.isOk() ? filterHashSchema.safeParse(json.value) : null;
  if (!parsed?.success) {
    return { tabId: defaultTabId, selection: {}, fields: {} };
  }

  const { tab, filter, ...fields } = parsed.data;
  const selection: FilterHashSelection<Category> = {};
  for (const category of categories) {
    const labels = selectedLabelsSchema.safeParse(filter?.[category]);
    const entries = Object.entries(labels.success ? labels.data : {})
      .flatMap(([id, label]) =>
        id.length > 0 && isString(label) ? [[id, label]] : []
      )
      .slice(0, maxIdsPerCategory);
    if (entries.length > 0) {
      selection[category] = Object.fromEntries(entries);
    }
  }
  return {
    tabId: tabIds.find((tabId) => tabId === tab) ?? defaultTabId,
    selection,
    fields,
  };
}

// Omits the default tab, empty categories and undefined `fields`; undefined when nothing is left.
export function serializeFilterHash<
  Category extends string,
  TabId extends string,
>(
  { tabId, selection }: FilterHashState<Category, TabId>,
  defaultTabId: TabId,
  fields: Record<string, unknown> = {}
): string | undefined {
  const filter = Object.fromEntries(
    Object.entries<Record<string, string> | undefined>(selection).filter(
      ([, labels]) => Object.keys(labels ?? {}).length > 0
    )
  );
  const state = Object.fromEntries(
    Object.entries({
      ...fields,
      tab: tabId !== defaultTabId ? tabId : undefined,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    }).filter(([, fieldValue]) => fieldValue !== undefined)
  );
  return Object.keys(state).length > 0
    ? toBase64Url(JSON.stringify(state))
    : undefined;
}
