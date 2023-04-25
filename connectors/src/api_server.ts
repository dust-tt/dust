import bodyParser from "body-parser";
import express from "express";

import { createConnectorAPIHandler } from "@connectors/api/createConnector";
import { resumeConnectorAPIHandler } from "@connectors/api/resumeConnector";
import { stopConnectorAPIHandler } from "@connectors/api/stopConnector";
import { getConnectorStatusAPIHandler } from "@connectors/api/syncStatus";
import logger from "@connectors/logger/logger";
import { authMiddleware } from "@connectors/middleware/auth";

export function startServer(port: number) {
  const app = express();

  app.use(authMiddleware);
  app.use(bodyParser.json());

  app.post("/connectors/create/:connector_provider", createConnectorAPIHandler);
  app.post("/connectors/stop/:connector_provider", stopConnectorAPIHandler);
  app.post("/connectors/resume/:connector_provider", resumeConnectorAPIHandler);
  app.get(
    "/connectors/sync_status/:connector_id",
    getConnectorStatusAPIHandler
  );

  app.listen(port, () => {
    logger.info(`Connectors API listening on port ${port}`);
  });
}
