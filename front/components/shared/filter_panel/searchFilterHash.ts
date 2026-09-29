import type {
  SearchFilter,
  SearchFilterCategory,
  SearchFilterOption,
} from "@app/components/shared/filter_panel/searchFilter";
import { useHashParam } from "@app/hooks/useHashParams";
import type { MCPServerType } from "@app/lib/api/mcp";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import {
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/types/resources_icon_names";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { useCallback, useMemo } from "react";
import { z } from "zod";

const SEARCH_FILTER_HASH_PARAM = "filters";

const optionFields = {
  id: z.string().min(1),
  name: z.string(),
  disabled: z.boolean(),
};

const mcpServerIconSchema = z.custom<MCPServerType["icon"]>(
  (icon) =>
    typeof icon === "string" &&
    (isCustomResourceIconType(icon) || isInternalAllowedIcon(icon))
);

const searchFilterOptionSchema: z.ZodType<SearchFilterOption> =
  z.discriminatedUnion("category", [
    z.object({
      ...optionFields,
      category: z.literal("access"),
      id: z.enum(["visible", "hidden"]),
    }),
    z.object({
      ...optionFields,
      category: z.literal("availability"),
      id: z.enum(SKILL_AVAILABILITIES),
    }),
    z.object({
      ...optionFields,
      category: z.literal("editor"),
      image: z.string().nullable(),
    }),
    z.object({ ...optionFields, category: z.literal("model") }),
    z.object({
      ...optionFields,
      category: z.literal("skill"),
      icon: z.string().nullable(),
    }),
    z.object({ ...optionFields, category: z.literal("space") }),
    z.object({ ...optionFields, category: z.literal("tag") }),
    z.object({
      ...optionFields,
      category: z.literal("tool"),
      icon: mcpServerIconSchema,
      mcpServerViewIds: z.array(z.string().min(1)),
    }),
  ]);

const searchFilterHashSchema = z.record(z.array(z.unknown()));

// base64url of the UTF-8 bytes: option names may hold any character, and the URL-safe alphabet
// needs no percent-encoding in the hash.
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
 * an empty filter, and options that fail validation, belong to a category outside `categories` or
 * are listed under another category MUST be dropped individually rather than discarding the other
 * selections.
 */
export function parseSearchFilterHash<Category extends SearchFilterCategory>(
  value: string | undefined,
  categories: readonly Category[]
): SearchFilter<Category> {
  const text = value ? fromBase64Url(value) : null;
  if (!text) {
    return {};
  }
  const json = safeParseJSON(text);
  if (json.isErr()) {
    return {};
  }
  const parsed = searchFilterHashSchema.safeParse(json.value);
  if (!parsed.success) {
    return {};
  }

  const filter: SearchFilter<Category> = {};
  for (const category of categories) {
    const options = (parsed.data[category] ?? []).flatMap((option) => {
      const result = searchFilterOptionSchema.safeParse(option);
      return result.success && result.data.category === category
        ? [result.data]
        : [];
    });
    if (options.length > 0) {
      filter[category] = options;
    }
  }
  return filter;
}

export function serializeSearchFilterHash<
  Category extends SearchFilterCategory,
>(filter: SearchFilter<Category>): string | undefined {
  const entries = Object.entries<SearchFilterOption[] | undefined>(filter)
    .filter(([, options]) => (options?.length ?? 0) > 0)
    .map(([category, options]) => [
      category,
      // Selected options are displayed by name only, so avatar URLs need not travel in links.
      options?.map((option) =>
        option.category === "editor" ? { ...option, image: null } : option
      ),
    ]);
  return entries.length > 0
    ? toBase64Url(JSON.stringify(Object.fromEntries(entries)))
    : undefined;
}

// `categories` must be referentially stable (a module-level constant).
export function useSearchFilterHashParam<Category extends SearchFilterCategory>(
  categories: readonly Category[]
): [SearchFilter<Category>, (filter: SearchFilter<Category>) => void] {
  const [value, setValue] = useHashParam(SEARCH_FILTER_HASH_PARAM);
  const filter = useMemo(
    () => parseSearchFilterHash(value, categories),
    [value, categories]
  );
  const setFilter = useCallback(
    (nextFilter: SearchFilter<Category>) =>
      setValue(serializeSearchFilterHash(nextFilter)),
    [setValue]
  );
  return [filter, setFilter];
}
