import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { z } from "zod";

const SCOPED_UI_PREFERENCES_KEY_PREFIX = "scopedUIPreferences";

const scopedUIPreferencesSchemaByScope = {
  projectUI: z.object({
    tab: z.enum(["conversations", "todos", "knowledge", "settings", "alpha"]),
    conversationsFilter: z.enum(["all", "group", "with_me"]),
    todosOwnerFilter: z.object({
      assigneeScope: z.enum(["mine", "all", "users"]),
      selectedUserSIds: z.array(z.string()),
    }),
  }),
} as const;

export type ProjectUIScopedPreferences = z.infer<
  (typeof scopedUIPreferencesSchemaByScope)["projectUI"]
>;

export type ScopedUIPreferencesScope =
  keyof typeof scopedUIPreferencesSchemaByScope;
type ScopeSchema<TScope extends ScopedUIPreferencesScope> =
  (typeof scopedUIPreferencesSchemaByScope)[TScope];
type ScopeValue<TScope extends ScopedUIPreferencesScope> =
  ScopeSchema<TScope>["_output"];

interface UseScopedUIPreferencesOptions<
  TScope extends ScopedUIPreferencesScope,
> {
  scope: TScope;
  /** When null/undefined/empty, preferences are not read or written (avoids a shared `"null"` key). */
  resourceId: string | null | undefined;
  defaultValue: ScopeValue<TScope>;
}

interface ScopedUIPreferencesState<TScope extends ScopedUIPreferencesScope> {
  value: ScopeValue<TScope>;
  setValue: (value: ScopeValue<TScope>) => void;
  resetValue: () => void;
}

function readPersistedValue(storageKey: string): unknown {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = localStorage.getItem(storageKey);
    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue);
  } catch {
    // Corrupted or unavailable localStorage — start fresh.
    return null;
  }
}

function writePersistedValue(storageKey: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // localStorage may be full or unavailable — silently ignore.
  }
}

/** Read persisted preferences synchronously (e.g. when `spaceId` changes before hook state catches up). */
export function readScopedUIPreferencesValue<
  TScope extends ScopedUIPreferencesScope,
>(
  scope: TScope,
  resourceId: string | null | undefined,
  defaultValue: ScopeValue<TScope>
): ScopeValue<TScope> {
  if (resourceId === null || resourceId === undefined || resourceId === "") {
    return defaultValue;
  }
  const storageKey = `${SCOPED_UI_PREFERENCES_KEY_PREFIX}:${scope}:${resourceId}`;
  const schema = scopedUIPreferencesSchemaByScope[scope];
  const candidateValue = readPersistedValue(storageKey);
  const parsedValue = schema.safeParse(candidateValue);
  return parsedValue.success ? parsedValue.data : defaultValue;
}

export function useScopedUIPreferences<
  TScope extends ScopedUIPreferencesScope,
>({
  scope,
  resourceId,
  defaultValue,
}: UseScopedUIPreferencesOptions<TScope>): ScopedUIPreferencesState<TScope> {
  const schema = scopedUIPreferencesSchemaByScope[scope];
  const storageKey = useMemo(() => {
    if (resourceId === null || resourceId === undefined || resourceId === "") {
      return null;
    }
    return `${SCOPED_UI_PREFERENCES_KEY_PREFIX}:${scope}:${resourceId}`;
  }, [resourceId, scope]);

  const readValue = useCallback((): ScopeValue<TScope> => {
    if (!storageKey) {
      return defaultValue;
    }
    const candidateValue = readPersistedValue(storageKey);
    const parsedValue = schema.safeParse(candidateValue);
    return parsedValue.success ? parsedValue.data : defaultValue;
  }, [defaultValue, schema, storageKey]);

  const [value, setValueState] = useState<ScopeValue<TScope>>(() =>
    readValue()
  );

  useLayoutEffect(() => {
    setValueState(readValue());
  }, [readValue]);

  const setValue = useCallback(
    (newValue: ScopeValue<TScope>) => {
      setValueState(newValue);
      if (storageKey) {
        writePersistedValue(storageKey, newValue);
      }
    },
    [storageKey]
  );

  const resetValue = useCallback(() => {
    setValueState(defaultValue);
    if (storageKey) {
      writePersistedValue(storageKey, defaultValue);
    }
  }, [defaultValue, storageKey]);

  return {
    value,
    setValue,
    resetValue,
  };
}
