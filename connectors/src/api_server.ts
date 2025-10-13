import bodyParser from "body-parser";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import morgan from "morgan";

import { adminAPIHandler } from "@connectors/api/admin";
import { patchConnectorConfigurationAPIHandler } from "@connectors/api/configuration";
import { createConnectorAPIHandler } from "@connectors/api/create_connector";
import { deleteConnectorAPIHandler } from "@connectors/api/delete_connector";
import {
  getConnectorAPIHandler,
  getConnectorsAPIHandler,
} from "@connectors/api/get_connector";
import { getConnectorPermissionsAPIHandler } from "@connectors/api/get_connector_permissions";
import { getNotionUrlStatusHandler } from "@connectors/api/notion_url_status";
import { pauseConnectorAPIHandler } from "@connectors/api/pause_connector";
import { resumeConnectorAPIHandler } from "@connectors/api/resume_connector";
import { setConnectorPermissionsAPIHandler } from "@connectors/api/set_connector_permissions";
import {
  getSlackChannelsLinkedWithAgentHandler,
  patchSlackChannelsLinkedWithAgentHandler,
} from "@connectors/api/slack_channels_linked_with_agent";
import { stopConnectorAPIHandler } from "@connectors/api/stop_connector";
import { syncConnectorAPIHandler } from "@connectors/api/sync_connector";
import { unpauseConnectorAPIHandler } from "@connectors/api/unpause_connector";
import { postConnectorUpdateAPIHandler } from "@connectors/api/update_connector";
import { webhookDiscordAppHandler } from "@connectors/api/webhooks/webhook_discord_app";
import { webhookGithubAPIHandler } from "@connectors/api/webhooks/webhook_github";
import {
  webhookIntercomAPIHandler,
  webhookIntercomUninstallAPIHandler,
} from "@connectors/api/webhooks/webhook_intercom";
import { webhookSlackAPIHandler } from "@connectors/api/webhooks/webhook_slack";
import { webhookSlackBotAPIHandler } from "@connectors/api/webhooks/webhook_slack_bot";
import { webhookSlackBotInteractionsAPIHandler } from "@connectors/api/webhooks/webhook_slack_bot_interaction";
import { webhookSlackInteractionsAPIHandler } from "@connectors/api/webhooks/webhook_slack_interaction";
import { webhookTeamsAPIHandler } from "@connectors/api/webhooks/webhook_teams";
import logger from "@connectors/logger/logger";
import { authMiddleware } from "@connectors/middleware/auth";
import { rateLimiter, setupGlobalErrorHandler } from "@connectors/types";

import {
  getConnectorConfigAPIHandler,
  setConnectorConfigAPIHandler,
} from "./api/connector_config";
import { webhookFirecrawlAPIHandler } from "./api/webhooks/webhook_firecrawl";

export function startServer(port: number) {
  setupGlobalErrorHandler(logger);
  const app = express();

  // Initialize logger.
  app.use(morgan("tiny"));

  // Indicates that the app is behind a proxy / LB. req.ip will be the left-most entry in the X-Forwarded-* header.
  app.set("trust proxy", true);

  // for health check -- doesn't go through auth middleware
  app.get("/", (_req, res) => {
    res.status(200).send("OK");
  });

  app.use(
    bodyParser.json({
      limit: "8mb",
      verify: (req, _res, buf) => {
        // @ts-expect-error -- rawBody is not defined on Request
        // but we need it to validate webhooks signatures
        req.rawBody = buf;
      },
    })
  );

  app.use(async (req: Request, res: Response, next: NextFunction) => {
    // Apply rate limiting to webhook endpoints only
    // Other endpoints are protected by authMiddleware
    if (req.path.startsWith("/webhooks")) {
      try {
        const clientIp = req.ip;
        const remainingRequests = await rateLimiter({
          key: `rate_limit:${clientIp}`,
          maxPerTimeframe: 1000,
          timeframeSeconds: 60,
          logger: logger,
        });
        if (remainingRequests > 0) {
          next();
        } else {
          logger.info(
            { clientIp, url: req.originalUrl },
            "Connector query rate limited."
          );
          res.status(429).send("Too many requests");
        }
      } catch (error) {
        next(error);
      }
    } else {
      next();
    }
  });

  app.use(authMiddleware);
  app.use(express.urlencoded({ extended: true, limit: "8mb" })); // support encoded bodies

  app.post("/connectors/create/:connector_provider", createConnectorAPIHandler);
  app.post("/connectors/update/:connector_id/", postConnectorUpdateAPIHandler);
  app.post("/connectors/stop/:connector_id", stopConnectorAPIHandler);
  app.post("/connectors/pause/:connector_id", pauseConnectorAPIHandler);
  app.post("/connectors/unpause/:connector_id", unpauseConnectorAPIHandler);
  app.post("/connectors/resume/:connector_id", resumeConnectorAPIHandler);
  app.delete("/connectors/delete/:connector_id", deleteConnectorAPIHandler);
  app.get("/connectors/:connector_id", getConnectorAPIHandler);
  app.get("/connectors", getConnectorsAPIHandler);
  app.post("/connectors/sync/:connector_id", syncConnectorAPIHandler);
  app.get(
    "/connectors/:connector_id/permissions",
    getConnectorPermissionsAPIHandler
  );
  app.post(
    "/connectors/:connector_id/permissions",
    setConnectorPermissionsAPIHandler
  );

  app.patch(
    "/slack/channels/linked_with_agent",
    patchSlackChannelsLinkedWithAgentHandler
  );
  app.get(
    "/slack/channels/linked_with_agent",
    getSlackChannelsLinkedWithAgentHandler
  );

  app.get("/notion/url/status", getNotionUrlStatusHandler);

  // (legacy) "Dust Data-sync" for indexing and handling calls to the dust bot.
  app.post("/webhooks/:webhook_secret/slack", webhookSlackAPIHandler);

  // (legacy) "Dust Data-sync" (legacy) when the user interacts with the dust bot.
  app.post(
    "/webhooks/:webhook_secret/slack_interaction",
    webhookSlackInteractionsAPIHandler
  );

  // "Dust" for handling calls to the dust bot.
  app.post("/webhooks/:webhook_secret/slack_bot", webhookSlackBotAPIHandler);

  // "Dust" when the user interacts with the dust bot.
  app.post(
    "/webhooks/:webhook_secret/slack_bot_interaction",
    webhookSlackBotInteractionsAPIHandler
  );
  app.post(
    "/webhooks/:webhooks_secret/github",
    bodyParser.raw({ type: "application/json" }),
    webhookGithubAPIHandler
  );
  app.post(
    "/webhooks/:webhooks_secret/intercom",
    bodyParser.raw({ type: "application/json" }),
    webhookIntercomAPIHandler
  );
  app.post(
    "/webhooks/:webhooks_secret/intercom/uninstall",
    bodyParser.raw({ type: "application/json" }),
    webhookIntercomUninstallAPIHandler
  );
  app.post(
    "/webhooks/:webhooks_secret/firecrawl",
    bodyParser.raw({ type: "application/json" }),
    webhookFirecrawlAPIHandler
  );
  app.post(
    "/webhooks/:webhooks_secret/discord/app",
    bodyParser.raw({ type: "application/json" }),
    webhookDiscordAppHandler
  );

  app.post("/webhooks/:webhook_secret/teams_messages", webhookTeamsAPIHandler);

  // /configuration/ is the new configration method, replacing the old /config/ method
  app.patch(
    "/connectors/:connector_id/configuration",
    patchConnectorConfigurationAPIHandler
  );

  // /config/ is the old configuration method, will disappear in the future
  app.post(
    "/connectors/:connector_id/config/:config_key",
    setConnectorConfigAPIHandler
  );

  app.get(
    "/connectors/:connector_id/config/:config_key",
    getConnectorConfigAPIHandler
  );

  app.post("/connectors/admin", adminAPIHandler);

  const server = app.listen(port, () => {
    logger.info(`Connectors API listening on port ${port}`);
  });

  const gracefulShutdown = () => {
    logger.info("[GRACEFUL] Received kill signal, shutting down gracefully.");
    server.close(() => {
      logger.info("[GRACEFUL] Closed out remaining connections.");
      process.exit();
    });

    setTimeout(() => {
      logger.error(
        "[GRACEFUL] Could not close connections within 30s, forcefully shutting down"
      );
      process.exit(1);
    }, 30 * 1000);
  };

  // listen for TERM signal .e.g. kill
  process.on("SIGTERM", gracefulShutdown);
  // listen for INT signal e.g. Ctrl-C
  process.on("SIGINT", gracefulShutdown);
}
