import { rateLimiter, setupGlobalErrorHandler } from "@dust-tt/types";
import bodyParser from "body-parser";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import morgan from "morgan";

import { createConnectorAPIHandler } from "@connectors/api/create_connector";
import { deleteConnectorAPIHandler } from "@connectors/api/delete_connector";
import { getConnectorAPIHandler } from "@connectors/api/get_connector";
import { getConnectorPermissionsAPIHandler } from "@connectors/api/get_connector_permissions";
import { getResourcesParentsAPIHandler } from "@connectors/api/get_resources_parents";
import { getResourcesTitlesAPIHandler } from "@connectors/api/get_resources_titles";
import { resumeConnectorAPIHandler } from "@connectors/api/resume_connector";
import { setConnectorPermissionsAPIHandler } from "@connectors/api/set_connector_permissions";
import {
  getSlackChannelsLinkedWithAgentHandler,
  patchSlackChannelsLinkedWithAgentHandler,
} from "@connectors/api/slack_channels_linked_with_agent";
import { stopConnectorAPIHandler } from "@connectors/api/stop_connector";
import { syncConnectorAPIHandler } from "@connectors/api/sync_connector";
import { getConnectorUpdateAPIHandler } from "@connectors/api/update_connector";
import { webhookGithubAPIHandler } from "@connectors/api/webhooks/webhook_github";
import { webhookGoogleDriveAPIHandler } from "@connectors/api/webhooks/webhook_google_drive";
import {
  webhookIntercomAPIHandler,
  webhookIntercomUninstallAPIHandler,
} from "@connectors/api/webhooks/webhook_intercom";
import { webhookSlackAPIHandler } from "@connectors/api/webhooks/webhook_slack";
import { getWebcrawlerConfiguration } from "@connectors/connectors/webcrawler";
import logger from "@connectors/logger/logger";
import { authMiddleware } from "@connectors/middleware/auth";

import {
  getConnectorConfigAPIHandler,
  setConnectorConfigAPIHandler,
} from "./api/connector_config";

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
      verify: (req, _res, buf) => {
        // @ts-expect-error -- rawBody is not defined on Request
        // but we need it to validate webhooks signatures
        req.rawBody = buf;
      },
    })
  );

  app.use(async (req: Request, res: Response, next: NextFunction) => {
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
  });

  app.use(authMiddleware);

  app.post("/connectors/create/:connector_provider", createConnectorAPIHandler);
  app.post("/connectors/update/:connector_id/", getConnectorUpdateAPIHandler);
  app.post("/connectors/stop/:connector_id", stopConnectorAPIHandler);
  app.post("/connectors/resume/:connector_id", resumeConnectorAPIHandler);
  app.delete("/connectors/delete/:connector_id", deleteConnectorAPIHandler);
  app.get("/connectors/:connector_id", getConnectorAPIHandler);
  app.post("/connectors/sync/:connector_id", syncConnectorAPIHandler);
  app.get(
    "/connectors/:connector_id/permissions",
    getConnectorPermissionsAPIHandler
  );
  app.post(
    // must be POST because of body
    "/connectors/:connector_id/resources/parents",
    getResourcesParentsAPIHandler
  );
  app.post(
    // must be POST because of body
    "/connectors/:connector_id/resources/titles",
    getResourcesTitlesAPIHandler
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

  app.post("/webhooks/:webhook_secret/slack", webhookSlackAPIHandler);
  app.post(
    "/webhooks/:webhook_secret/google_drive/:connector_id?",
    webhookGoogleDriveAPIHandler
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
    "/connectors/:connector_id/config/:config_key",
    setConnectorConfigAPIHandler
  );

  app.get(
    "/connectors/:connector_id/config/:config_key",
    getConnectorConfigAPIHandler
  );

  app.get(
    "/connectors/webcrawler/:connector_id/configuration",
    getWebcrawlerConfiguration
  );

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
