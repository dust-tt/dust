import config from "@app/lib/api/config";
import { JiraClient } from "@app/lib/triggers/built-in-webhooks/jira/jira_client";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { OAuthAPI } from "@app/types";
import { isDevelopment } from "@app/types/shared/env";

async function deleteAllJiraWebhooks(
  { connectionId }: { connectionId: string },
  execute: boolean,
  logger: Logger
) {
  if (!isDevelopment()) {
    throw new Error("This script can only be run in development.");
  }

  const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  const tokenRes = await oauthAPI.getAccessToken({
    connectionId,
  });
  if (tokenRes.isErr()) {
    throw new Error("Failed to get Jira access token");
  }

  const { access_token: accessToken } = tokenRes.value;
  const client = new JiraClient(accessToken);

  const resourcesRes = await client.getAccessibleResources();
  if (resourcesRes.isErr()) {
    throw new Error(`Failed to get resources: ${resourcesRes.error.message}`);
  }

  const resources = resourcesRes.value;
  if (resources.length === 0) {
    throw new Error("No accessible Jira resources found");
  }

  const cloudId = resources[0].id;
  logger.info(`Using Jira cloud ID: ${cloudId}`);

  const webhooksRes = await client.getWebhooks(cloudId);
  if (webhooksRes.isErr()) {
    throw new Error(`Failed to get webhooks: ${webhooksRes.error.message}`);
  }

  const webhooks = webhooksRes.value;
  logger.info(`Found ${webhooks.length} webhook(s) to delete`);

  if (webhooks.length === 0) {
    logger.info("No webhook to delete.");
    return;
  }

  if (!execute) {
    logger.info(
      `Would delete ${webhooks.length} webhook(s). Use --execute to proceed.`
    );
    webhooks.forEach((webhook) => {
      logger.info(`  - Webhook ID ${webhook.id}: ${webhook.url}`);
    });
    return;
  }

  logger.info(`Deleting ${webhooks.length} webhook(s)...`);
  const deleteRes = await client.deleteWebhooks({
    cloudId,
    webhookIds: webhooks.map((webhook) => webhook.id),
  });

  if (deleteRes.isErr()) {
    throw new Error(`Failed to delete webhooks: ${deleteRes.error.message}`);
  }

  logger.info("Successfully deleted all webhooks");
}

makeScript(
  {
    connectionId: {
      type: "string",
      demandOption: true,
      description: "The Jira OAuth connection ID",
    },
  },
  async (args, logger) =>
    deleteAllJiraWebhooks(args, args.execute ?? false, logger)
);
