import { getSlackI18n } from "@connectors/connectors/slack/lib/i18n";
import type { SlackUserInfo } from "@connectors/connectors/slack/lib/slack_client";
import {
  getSlackClient,
  getSlackUserInfoMemoized,
} from "@connectors/connectors/slack/lib/slack_client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { getDustAPI } from "@connectors/lib/api/dust_api";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import { cacheWithRedisResult } from "@connectors/types";
import type { SupportedLocale } from "@connectors/types/locale";
import { DEFAULT_LOCALE, isSupportedLocale } from "@connectors/types/locale";
import type { APIError, GetMemberLocaleResponseType } from "@dust-tt/client";
import type { I18n } from "@lingui/core";
import type { WebClient } from "@slack/web-api";

/**
 * @cc [owner:Nils-Fedrigo,label:product] slack-locale-resolution
 * MUST return `DEFAULT_LOCALE` when `dustLocales` is `null` or its `localisationEnabled` is false.
 * Otherwise it MUST return the first of these that is a `SUPPORTED_LOCALES` entry: the locale the
 * user chose in Dust (`userLocale`), the user's Slack locale (`slackLocale`), the workspace locale
 * (`workspaceLocale`), and `DEFAULT_LOCALE` when none is.
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
    [dustLocales.userLocale, slackLocale, dustLocales.workspaceLocale].find(
      isSupportedLocale
    ) ?? DEFAULT_LOCALE
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

/**
 * Returns the `I18n` to write to this Slack user, or in the workspace locale when `slackUserInfo`
 * is `null` or a bot (Slack workflows, channel-wide messages).
 */
export async function getSlackI18nForUser(
  connector: ConnectorResource,
  slackUserId: string | null,
  slackUserInfo: SlackUserInfo | null
): Promise<I18n> {
  const human = slackUserInfo && !slackUserInfo.is_bot ? slackUserInfo : null;

  const dustLocalesRes = await getDustLocalesMemoized(connector, {
    email: human?.email ?? null,
    slackUserId: human ? slackUserId : null,
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

/**
 * Same as `getSlackI18nForUser` when only the Slack user id is known. Falls back to the workspace
 * locale when the user cannot be fetched from Slack.
 */
export async function getSlackI18nForUserId(
  connector: ConnectorResource,
  slackClient: WebClient,
  slackUserId: string | undefined
): Promise<I18n> {
  let slackUserInfo: SlackUserInfo | null = null;
  if (slackUserId) {
    try {
      slackUserInfo = await getSlackUserInfoMemoized(
        connector.id,
        slackClient,
        slackUserId
      );
    } catch (error) {
      // Slack Web API errors: write in the workspace locale rather than not at all.
      logger.warn(
        { connectorId: connector.id, slackUserId, error },
        "Failed to get Slack user info to pick their locale"
      );
    }
  }
  return getSlackI18nForUser(connector, slackUserId ?? null, slackUserInfo);
}

/**
 * Same as `getSlackI18nForUserId` from a Slack team id, for interaction payloads. Returns the
 * default locale when the team has no active Slack bot configuration.
 */
export async function getSlackI18nForTeamUser(
  slackTeamId: string,
  slackUserId: string
): Promise<I18n> {
  const slackConfig =
    await SlackConfigurationResource.fetchByActiveBot(slackTeamId);
  const connector = slackConfig
    ? await ConnectorResource.fetchById(slackConfig.connectorId)
    : null;
  if (!connector) {
    return getSlackI18n(DEFAULT_LOCALE);
  }
  const slackClient = await getSlackClient(connector.id);
  return getSlackI18nForUserId(connector, slackClient, slackUserId);
}
