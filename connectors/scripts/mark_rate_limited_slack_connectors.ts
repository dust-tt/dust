import type { Logger } from "pino";

import { getJoinedChannels } from "@connectors/connectors/slack/lib/channels";
import {
  getSlackClient,
  withSlackErrorHandling,
} from "@connectors/connectors/slack/lib/slack_client";
import { ProviderRateLimitError } from "@connectors/lib/error";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import { concurrentExecutor } from "@connectors/types";

import { makeScript } from "./helpers";

// Stress test for rate limiting. New Slack quotas are 1 call/minute for Tier 3 endpoints,
// running 10 calls in parallel should be enough to trigger the rate limit.
const TEST_CALLS_COUNT = 10;

// Slack quotas changed on 2025-05-29 for all new installations.
const SLACK_RATE_LIMIT_CUTOFF_DATE = new Date("2025-05-29");

const SLACK_CONNECTOR_TYPE = "slack";

async function handleRateLimit(
  connector: ConnectorResource,
  {
    context,
    execute,
    logger,
  }: { context: string; execute: boolean; logger: Logger }
) {
  logger.error(
    { connectorId: connector.id },
    `Rate limit detected ${context} - marking connector as rate limited`
  );

  const args = {
    connectorId: connector.id,
    createdAt: connector.createdAt,
    updatedAt: connector.updatedAt,
    workspaceId: connector.workspaceId,
  };

  if (execute) {
    await connector.markAsRateLimited();
    logger.info(args, "Connector marked as rate limited");
  } else {
    logger.info(args, "DRY RUN: Would mark connector as rate limited");
  }
}

makeScript(
  {
    connectorId: { type: "number", required: false },
  },
  async ({ connectorId, execute }, logger) => {
    const slackConnectors = connectorId
      ? await ConnectorResource.fetchByIds(SLACK_CONNECTOR_TYPE, [connectorId])
      : await ConnectorResource.listByType(SLACK_CONNECTOR_TYPE, {});

    logger.info(
      `Testing ${slackConnectors.length} Slack connector(s) for rate limits`
    );

    for (const connector of slackConnectors) {
      logger.info(
        { connectorId: connector.id },
        "Starting rate limit test for connector"
      );

      try {
        const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
          connector.id
        );
        if (!slackConfig) {
          logger.warn(
            { connectorId: connector.id },
            "No Slack configuration found"
          );
          continue;
        }

        const slackClient = await getSlackClient(connector.id);

        let channels;
        try {
          channels = await withSlackErrorHandling(async () =>
            getJoinedChannels(slackClient, connector.id)
          );
        } catch (error: unknown) {
          if (error instanceof ProviderRateLimitError) {
            await handleRateLimit(connector, {
              context: "while fetching channels",
              execute,
              logger,
            });
            continue;
          } else {
            throw error;
          }
        }
        const [testChannel] = channels;
        if (!testChannel) {
          logger.warn(
            { connectorId: connector.id },
            "No channels found for connector"
          );
          continue;
        }

        logger.info(
          {
            connectorId: connector.id,
            channelName: testChannel.name,
            channelId: testChannel.id,
          },
          "Testing with channel"
        );

        const results = await concurrentExecutor(
          Array.from({ length: TEST_CALLS_COUNT }, (_, i) => i),
          async (i): Promise<boolean> => {
            try {
              logger.info(
                { connectorId: connector.id, attempt: i + 1 },
                `Making test API call ${i + 1}/${TEST_CALLS_COUNT}`
              );

              await withSlackErrorHandling(async () =>
                slackClient.conversations.history({
                  channel: testChannel.id!,
                  limit: 100,
                })
              );

              logger.info(
                { connectorId: connector.id, attempt: i + 1 },
                "API call successful"
              );

              return false;
            } catch (error: unknown) {
              if (error instanceof ProviderRateLimitError) {
                logger.error(
                  { connectorId: connector.id, attempt: i + 1 },
                  "ProviderRateLimitError detected!"
                );
                return true;
              } else {
                logger.error(
                  {
                    connectorId: connector.id,
                    attempt: i + 1,
                    error,
                  },
                  "API call failed with non-rate-limit error"
                );
                return false;
              }
            }
          },
          { concurrency: TEST_CALLS_COUNT }
        );

        const rateLimitDetected = results.some((r) => r);
        if (
          rateLimitDetected ||
          connector.createdAt > SLACK_RATE_LIMIT_CUTOFF_DATE
        ) {
          await handleRateLimit(connector, {
            context: "during API calls",
            execute,
            logger,
          });
        } else {
          logger.info(
            { connectorId: connector.id },
            "No rate limiting detected - connector appears healthy"
          );
        }
      } catch (error: unknown) {
        logger.error(
          {
            connectorId: connector.id,
            error,
          },
          "Failed to test connector"
        );
      }
    }

    logger.info("Rate limit testing completed");
  }
);
