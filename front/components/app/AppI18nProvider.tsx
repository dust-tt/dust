import { SparkleLocaleProvider } from "@app/components/app/SparkleLocaleProvider";
import { i18n } from "@app/lib/i18n/i18n";
import { I18nProvider } from "@lingui/react";
import type { ReactNode } from "react";

interface AppI18nProviderProps {
  children: ReactNode;
}

/**
 * @cc [owner:ykmsd,label:react] app-i18n-provider
 * Mounts front's `I18nProvider` with the `i18n` instance of `lib/i18n/i18n.ts`, and below it the
 * `SparkleLocaleProvider` that makes sparkle follow front's locale. Every app root MUST use it
 * instead of mounting `I18nProvider` itself, so that no app renders sparkle without its locale.
 */
export function AppI18nProvider({ children }: AppI18nProviderProps) {
  return (
    <I18nProvider i18n={i18n}>
      <SparkleLocaleProvider>{children}</SparkleLocaleProvider>
    </I18nProvider>
  );
}
