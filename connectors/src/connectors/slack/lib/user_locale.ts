import { isSlackWebAPIError } from "@connectors/connectors/slack/lib/errors";
import { getSlackI18n } from "@connectors/connectors/slack/lib/i18n";
import type { SlackUserInfo } from "@connectors/connectors/slack/lib/slack_client";
import { getSlackUserInfoMemoized } from "@connectors/connectors/slack/lib/slack_client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { getDustAPI } from "@connectors/lib/api/dust_api";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { cacheWithRedisResult } from "@connectors/types";
import type { SupportedLocale } from "@connectors/types/locale";
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  SUPPORTED_LOCALES,
} from "@connectors/types/locale";
import type { APIError, GetMemberLocaleResponseType } from "@dust-tt/client";
import type { I18n } from "@lingui/core";
import type { WebClient } from "@slack/web-api";

// Slack has regional variants Dust does not support (e.g. `fr-CA`): fall back to the first supported
// locale of the same language rather than to another language.
function toSupportedLocale(
  locale: string | null | undefined
): SupportedLocale | null {
  if (!locale) {
    return null;
  }
  if (isSupportedLocale(locale)) {
    return locale;
  }
  const [language] = locale.split("-");
  return (
    SUPPORTED_LOCALES.find(
      (supportedLocale) => supportedLocale.split("-")[0] === language
    ) ?? null
  );
}

/**
 * @cc [owner:Nils-Fedrigo,label:product] slack-locale-resolution
 * MUST return `DEFAULT_LOCALE` when `dustLocales` is `null` or its `localisationEnabled` is false.
 * Otherwise it MUST return the first of these that is set: the locale the user chose in Dust
 * (`userLocale`) if it is a `SUPPORTED_LOCALES` entry, the user's Slack locale (`slackLocale`) if
 * it is a `SUPPORTED_LOCALES` entry or else the first `SUPPORTED_LOCALES` entry of the same
 * language, the workspace locale (`workspaceLocale`) if it is a `SUPPORTED_LOCALES` entry, and
 * `DEFAULT_LOCALE`.
 */
export function resolveSlackLocale({
  dustLocales,
  slackLocale,
}: {
  dustLocales: GetMemberLocaleResponseType | null;
  slackLocale: string | null | undefined;
}): SupportedLocale {
  if (!dustLocales?.localisationEnabled) {
    return DEFAULT_LOCALE;
  }
  return (
    [
      dustLocales.userLocale,
      toSupportedLocale(slackLocale),
      dustLocales.workspaceLocale,
    ].find(isSupportedLocale) ?? DEFAULT_LOCALE
  );
}

async function getDustLocales(
  connector: ConnectorResource,
  {
    email,
  }: {
    email: string | null;
    // Only used in the cache key: the email is not written to Redis keys.
    slackUserId: string | null;
  }
) {
  return getDustAPI(dataSourceConfigFromConnector(connector)).getMemberLocale({
    email: email ?? undefined,
  });
}

// Bounds Dust -> Slack locale propagation to 10 min while avoiding a front call per bot message.
const getDustLocalesMemoized = cacheWithRedisResult<
  GetMemberLocaleResponseType,
  APIError,
  Parameters<typeof getDustLocales>
>(
  getDustLocales,
  (connector, { slackUserId }) =>
    `slack-dust-locales-${connector.id}-${slackUserId ?? "workspace"}`,
  { ttlMs: 10 * 60 * 1000 }
);

async function getSlackUserInfoOrNull(
  connector: ConnectorResource,
  slackClient: WebClient,
  slackUserId: string
): Promise<SlackUserInfo | null> {
  try {
    return await getSlackUserInfoMemoized(
      connector.id,
      slackClient,
      slackUserId
    );
  } catch (error) {
    if (!isSlackWebAPIError(error)) {
      throw error;
    }
    // Write in the workspace locale rather than not at all.
    logger.warn(
      { connectorId: connector.id, slackUserId, error },
      "Failed to get Slack user info to pick their locale"
    );
    return null;
  }
}

/**
 * Returns the `I18n` to write to this Slack user. Falls back to the workspace locale when
 * `slackUserId` is not set (Slack workflows, channel-wide messages), is a bot, or cannot be fetched
 * from Slack.
 */
export async function getSlackI18nForUser(
  connector: ConnectorResource,
  slackClient: WebClient,
  slackUserId: string | null | undefined
): Promise<I18n> {
  const slackUserInfo = slackUserId
    ? await getSlackUserInfoOrNull(connector, slackClient, slackUserId)
    : null;
  const human = slackUserInfo && !slackUserInfo.is_bot ? slackUserInfo : null;

  const dustLocalesRes = await getDustLocalesMemoized(connector, {
    email: human?.email ?? null,
    slackUserId: human ? (slackUserId ?? null) : null,
  });
  if (dustLocalesRes.isErr()) {
    logger.warn(
      { connectorId: connector.id, error: dustLocalesRes.error },
      "Failed to get the Dust locales of a Slack user, writing in the default locale"
    );
  }

  return getSlackI18n(
    resolveSlackLocale({
      dustLocales: dustLocalesRes.isOk() ? dustLocalesRes.value : null,
      slackLocale: human?.locale,
    })
  );
}
