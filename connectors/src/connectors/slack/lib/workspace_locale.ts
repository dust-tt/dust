import { getSlackI18n } from "@connectors/connectors/slack/lib/i18n";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { getDustAPI } from "@connectors/lib/api/dust_api";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { cacheWithRedisResult } from "@connectors/types";
import type { SupportedLocale } from "@connectors/types/locale";
import { DEFAULT_LOCALE, isSupportedLocale } from "@connectors/types/locale";
import type { APIError, GetMemberLocaleResponseType } from "@dust-tt/client";
import type { I18n } from "@lingui/core";

/**
 * @cc [owner:Nils-Fedrigo,label:product] slack-locale-resolution
 * MUST return `DEFAULT_LOCALE` when `dustLocales` is `null` or its `localisationEnabled` is false.
 * Otherwise it MUST return the locale set in the Dust workspace settings (`workspaceLocale`) if it
 * is a `SUPPORTED_LOCALES` entry, and `DEFAULT_LOCALE` otherwise. The locales of individual users
 * (in Dust or in Slack) MUST NOT be used.
 */
export function resolveSlackLocale(
  dustLocales: GetMemberLocaleResponseType | null
): SupportedLocale {
  if (!dustLocales?.localisationEnabled) {
    return DEFAULT_LOCALE;
  }
  return isSupportedLocale(dustLocales.workspaceLocale)
    ? dustLocales.workspaceLocale
    : DEFAULT_LOCALE;
}

async function getDustLocales(connector: ConnectorResource) {
  return getDustAPI(dataSourceConfigFromConnector(connector)).getMemberLocale(
    {}
  );
}

// Bounds Dust -> Slack locale propagation to 10 min while avoiding a front call per bot message.
const getDustLocalesMemoized = cacheWithRedisResult<
  GetMemberLocaleResponseType,
  APIError,
  Parameters<typeof getDustLocales>
>(getDustLocales, (connector) => `slack-workspace-locale-${connector.id}`, {
  ttlMs: 10 * 60 * 1000,
});

/**
 * Returns the `I18n` to write Slack text in: the locale set in the Dust workspace settings.
 */
export async function getSlackI18nForWorkspace(
  connector: ConnectorResource
): Promise<I18n> {
  const dustLocalesRes = await getDustLocalesMemoized(connector);
  if (dustLocalesRes.isErr()) {
    logger.warn(
      { connectorId: connector.id, error: dustLocalesRes.error },
      "Failed to get the Dust workspace locale, writing in the default locale"
    );
  }

  return getSlackI18n(
    resolveSlackLocale(dustLocalesRes.isOk() ? dustLocalesRes.value : null)
  );
}
