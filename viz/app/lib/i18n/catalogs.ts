import type { Messages } from "@lingui/core";
import type { VizCatalogLocale } from "@viz/app/lib/i18n/locales";
import { messages as deDEMessages } from "@viz/locales/de-DE/messages";
import { messages as enGBMessages } from "@viz/locales/en-GB/messages";
import { messages as enUSMessages } from "@viz/locales/en-US/messages";
import { messages as frFRMessages } from "@viz/locales/fr-FR/messages";

export interface VizCatalog {
  locale: VizCatalogLocale;
  messages: Messages;
}

const MESSAGES_BY_LOCALE: Record<VizCatalogLocale, Messages> = {
  "en-US": enUSMessages,
  "en-GB": enGBMessages,
  "fr-FR": frFRMessages,
  "de-DE": deDEMessages,
};

/**
 * @cc [owner:ykmsd,label:performance] viz-catalogs-server-only
 * Only server components MAY import this module (client modules MAY import its types). The server
 * passes the resolved locale's catalog to `VizI18nProvider`, so that the client bundle contains no
 * catalog and a frame downloads only its own language, in the RSC payload.
 */
export function getVizCatalog(locale: VizCatalogLocale): VizCatalog {
  return { locale, messages: MESSAGES_BY_LOCALE[locale] };
}
