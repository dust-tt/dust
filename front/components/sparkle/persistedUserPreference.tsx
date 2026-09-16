import { useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { memo, useCallback, useEffect, useState } from "react";

/**
 * A small user preference (font, accent color, ...) stored as user metadata
 * so it follows the user across devices, mirrored in localStorage so the first
 * paint already reflects it, and applied to the document by `apply`.
 */
export interface PersistedUserPreferenceOptions<T extends string> {
  metadataKey: string;
  storageKey: string;
  defaultValue: T;
  isValid: (value: string | null | undefined) => value is T;
  /** Applies the value to the document (typically an attribute on <html>). */
  apply: (value: T) => void;
  /** Used in error logs. */
  label: string;
}

export function readStoredPreference<T extends string>({
  storageKey,
  defaultValue,
  isValid,
}: Pick<
  PersistedUserPreferenceOptions<T>,
  "storageKey" | "defaultValue" | "isValid"
>): T {
  if (typeof window === "undefined") {
    return defaultValue;
  }
  try {
    const stored = localStorage.getItem(storageKey);
    return isValid(stored) ? stored : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function usePersistedUserPreference<T extends string>({
  metadataKey,
  storageKey,
  defaultValue,
  isValid,
  apply,
  label,
}: PersistedUserPreferenceOptions<T>): {
  value: T;
  // Resolves to false when the server save failed (the value still applies
  // locally); callers surface that to the user.
  setValue: (value: T) => Promise<boolean>;
} {
  const [value, setValueState] = useState<T>(() =>
    readStoredPreference({ storageKey, defaultValue, isValid })
  );

  // The server value wins over the local mirror whenever it changes (initial
  // load, or a choice made on another device). Adopting it during render with
  // the previous-value pattern, rather than in an effect, means a local change
  // never gets clobbered by a stale server value while its save is in flight.
  const { metadata, mutateMetadata } = useUserMetadata(metadataKey);
  const serverValue = metadata?.value;
  // Starts undefined (not `serverValue`) so a value already present on the
  // first render, e.g. from the SWR cache, is adopted as well.
  const [prevServerValue, setPrevServerValue] = useState<string | undefined>(
    undefined
  );
  if (serverValue !== prevServerValue) {
    setPrevServerValue(serverValue);
    if (isValid(serverValue)) {
      setValueState(serverValue);
    }
  }

  // Sync the external systems (the document and the localStorage mirror read
  // by the pre-hydration script) from the current value.
  useEffect(() => {
    apply(value);
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      // Storage may be unavailable (private mode); the document still updates.
    }
  }, [value, apply, storageKey]);

  const setValue = useCallback(
    async (next: T) => {
      setValueState(next);
      try {
        await setUserMetadataFromClient({ key: metadataKey, value: next });
      } catch (err) {
        // The local choice still applies; it just won't follow the user to
        // other devices until the next successful save.
        logger.error(
          { preference: label, value: next, err: normalizeError(err) },
          "Failed to save user preference"
        );
        return false;
      }
      await mutateMetadata(
        { metadata: { key: metadataKey, value: next } },
        { revalidate: false }
      );
      return true;
    },
    [metadataKey, label, mutateMetadata]
  );

  return { value, setValue };
}

/**
 * Builds the inline script that applies a stored preference before React
 * hydration, like ThemeScript does for dark mode. The output is
 * self-contained: it only embeds the literal keys and allowed values.
 */
export function buildPreferenceInitScript({
  storageKey,
  attribute,
  values,
}: {
  storageKey: string;
  attribute: string;
  /** Values that set the attribute; the default is omitted so it sets nothing. */
  values: readonly string[];
}): string {
  const allowed = JSON.stringify(values);
  return `function(){try{const v=localStorage.getItem(${JSON.stringify(storageKey)});if(${allowed}.includes(v)){document.documentElement.setAttribute(${JSON.stringify(attribute)},v)}}catch(e){}}`;
}

export const PreferenceInitScript = memo(function PreferenceInitScript({
  script,
}: {
  script: string;
}) {
  return <script dangerouslySetInnerHTML={{ __html: `(${script})()` }} />;
});

/** Sets or removes `attribute` on <html>; the default value removes it. */
export function applyDocumentAttribute<T extends string>(
  attribute: string,
  value: T,
  defaultValue: T
): void {
  if (typeof document === "undefined") {
    return;
  }
  if (value === defaultValue) {
    document.documentElement.removeAttribute(attribute);
  } else {
    document.documentElement.setAttribute(attribute, value);
  }
}
