import { DEV_MODE_ACTIVE } from "@app/components/dev/devModeConstants";
import type { PseudoLocale, SupportedLocale } from "@app/types/locale";
import {
  isSupportedLocale,
  PSEUDO_LOCALE,
  SUPPORTED_LOCALES,
} from "@app/types/locale";
import { useSyncExternalStore } from "react";

const LOCALE_OVERRIDE_STORAGE_KEY = "dust_locale_override";

export type LocaleOverride = SupportedLocale | PseudoLocale;

export const LOCALE_OVERRIDES: readonly LocaleOverride[] = [
  ...SUPPORTED_LOCALES,
  PSEUDO_LOCALE,
];

export function isLocaleOverride(value: unknown): value is LocaleOverride {
  return isSupportedLocale(value) || value === PSEUDO_LOCALE;
}

const listeners = new Set<() => void>();

function readStoredLocaleOverride(): LocaleOverride | null {
  try {
    const storedLocale = sessionStorage.getItem(LOCALE_OVERRIDE_STORAGE_KEY);
    return isLocaleOverride(storedLocale) ? storedLocale : null;
  } catch {
    return null;
  }
}

let localeOverride = readStoredLocaleOverride();

/**
 * @cc [owner:sfriquet,label:product] override-only-in-dev-mode
 * The locale override MUST be `null` when the dev console is not active (`DEV_MODE_ACTIVE`), and
 * otherwise the locale last passed to `setLocaleOverride` on the current page. Before any call on
 * the page, it MUST be the locale stored in the tab's `sessionStorage`, or `null` when none is
 * stored, the stored value is not one `setLocaleOverride` accepts, or storage cannot be read.
 */
export function getLocaleOverride(): LocaleOverride | null {
  return DEV_MODE_ACTIVE ? localeOverride : null;
}

/**
 * @cc [owner:sfriquet,label:product;react] set-override-applies-immediately
 * Setting the locale override MUST notify `useLocaleOverride` subscribers immediately, and MUST
 * persist it in the tab's `sessionStorage` when storage is available (`null` clears it). Storage
 * failure MUST NOT throw nor block the live change.
 */
export function setLocaleOverride(locale: LocaleOverride | null): void {
  localeOverride = locale;
  for (const listener of listeners) {
    listener();
  }
  try {
    if (locale) {
      sessionStorage.setItem(LOCALE_OVERRIDE_STORAGE_KEY, locale);
    } else {
      sessionStorage.removeItem(LOCALE_OVERRIDE_STORAGE_KEY);
    }
  } catch {
    return;
  }
}

function subscribeLocaleOverride(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getServerLocaleOverride(): null {
  return null;
}

export function useLocaleOverride(): LocaleOverride | null {
  return useSyncExternalStore(
    subscribeLocaleOverride,
    getLocaleOverride,
    getServerLocaleOverride
  );
}
