import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { getDustAPI } from "@connectors/lib/api/dust_api";
import { getBotI18n } from "@connectors/lib/bot/i18n";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { cacheWithRedisResult } from "@connectors/types";
import type { SupportedLocale } from "@connectors/types/locale";
import { DEFAULT_LOCALE, isSupportedLocale } from "@connectors/types/locale";
import type { APIError, GetMemberLocaleResponseType } from "@dust-tt/client";
import type { I18n } from "@lingui/core";

/**
 * @cc [owner:sfriquet,label:product] teams-locale-resolution
 * MUST return `workspaceLocale` when `dustLocales` is set, its `localisationEnabled` is true and its
 * `workspaceLocale` is a `SUPPORTED_LOCALES` entry, and `DEFAULT_LOCALE` otherwise. The locale a
 * member chose in Dust (`userLocale`) MUST NOT be used.
 */
export function resolveTeamsLocale(
  dustLocales: GetMemberLocaleResponseType | null
): SupportedLocale {
  if (
    dustLocales?.localisationEnabled &&
    isSupportedLocale(dustLocales.workspaceLocale)
  ) {
    return dustLocales.workspaceLocale;
  }
  return DEFAULT_LOCALE;
}

async function getDustLocales(connector: ConnectorResource) {
  return getDustAPI(dataSourceConfigFromConnector(connector)).getMemberLocale(
    {}
  );
}

// Bounds Dust -> Teams locale propagation to 10 min while avoiding a front call per bot message.
const getDustLocalesMemoized = cacheWithRedisResult<
  GetMemberLocaleResponseType,
  APIError,
  Parameters<typeof getDustLocales>
>(getDustLocales, (connector) => `teams-dust-locales-${connector.id}`, {
  ttlMs: 10 * 60 * 1000,
});

/**
 * Returns the `I18n` of the workspace locale of `connector`, or of `DEFAULT_LOCALE` when there is no
 * connector or the Dust lookup fails.
 */
export async function getTeamsI18n(
  connector: ConnectorResource | null
): Promise<I18n> {
  if (!connector) {
    return getBotI18n(DEFAULT_LOCALE);
  }

  const dustLocalesRes = await getDustLocalesMemoized(connector);
  if (dustLocalesRes.isErr()) {
    logger.warn(
      { connectorId: connector.id, error: dustLocalesRes.error },
      "Failed to get the Dust workspace locale, writing in the default locale"
    );
  }

  return getBotI18n(
    resolveTeamsLocale(dustLocalesRes.isOk() ? dustLocalesRes.value : null)
  );
}
