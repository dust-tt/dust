import bodyParser from "body-parser";
import express from "express";

import { createConnectorAPIHandler } from "@connectors/api/create_connector";
import { deleteConnectorAPIHandler } from "@connectors/api/delete_connector";
import { getConnectorAPIHandler } from "@connectors/api/get_connector";
import { resumeConnectorAPIHandler } from "@connectors/api/resume_connector";
import { stopConnectorAPIHandler } from "@connectors/api/stop_connector";
import { syncConnectorAPIHandler } from "@connectors/api/sync_connector";
import { webhookSlackAPIHandler } from "@connectors/api/webhooks/webhook_slack";
import logger from "@connectors/logger/logger";
import { authMiddleware } from "@connectors/middleware/auth";

export function startServer(port: number) {
  const app = express();

  app.use(authMiddleware);
  app.use(bodyParser.json());

  app.post("/connectors/create/:connector_provider", createConnectorAPIHandler);
  app.post("/connectors/stop/:connector_id", stopConnectorAPIHandler);
  app.post("/connectors/resume/:connector_id", resumeConnectorAPIHandler);
  app.delete("/connectors/delete/:connector_id", deleteConnectorAPIHandler);
  app.get("/connectors/:connector_id", getConnectorAPIHandler);
  app.post("/connectors/sync/:connector_id", syncConnectorAPIHandler);

  app.post("/webhooks/:webhook_secret/slack", webhookSlackAPIHandler);

  app.listen(port, () => {
    logger.info(`Connectors API listening on port ${port}`);
  });
}
