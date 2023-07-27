import bodyParser from "body-parser";
import express from "express";

import { createConnectorAPIHandler } from "@connectors/api/create_connector";
import { deleteConnectorAPIHandler } from "@connectors/api/delete_connector";
import { getConnectorAPIHandler } from "@connectors/api/get_connector";
import { getConnectorPermissionsAPIHandler } from "@connectors/api/get_connector_permissions";
import {
  googleDriveGetFoldersAPIHandler,
  googleDriveSetFoldersAPIHandler,
} from "@connectors/api/google_drive";
import { resumeConnectorAPIHandler } from "@connectors/api/resume_connector";
import { setConnectorPermissionsAPIHandler } from "@connectors/api/set_connector_permissions";
import { stopConnectorAPIHandler } from "@connectors/api/stop_connector";
import { syncConnectorAPIHandler } from "@connectors/api/sync_connector";
import { getConnectorUpdateAPIHandler } from "@connectors/api/update_connector";
import { webhookGithubAPIHandler } from "@connectors/api/webhooks/webhook_github";
import { webhookGoogleDriveAPIHandler } from "@connectors/api/webhooks/webhook_google_drive";
import { webhookSlackAPIHandler } from "@connectors/api/webhooks/webhook_slack";
import logger from "@connectors/logger/logger";
import { authMiddleware } from "@connectors/middleware/auth";

export function startServer(port: number) {
  const app = express();

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
    "/connectors/:connector_id/permissions",
    setConnectorPermissionsAPIHandler
  );

  app.post("/webhooks/:webhook_secret/slack", webhookSlackAPIHandler);
  app.post(
    "/webhooks/:webhook_secret/google_drive",
    webhookGoogleDriveAPIHandler
  );
  app.post(
    "/webhooks/:webhooks_secret/github",
    bodyParser.raw({ type: "application/json" }),
    webhookGithubAPIHandler
  );

  app.get(
    "/connectors/:connector_id/google_drive/folders",
    googleDriveGetFoldersAPIHandler
  );
  app.post(
    "/connectors/:connector_id/google_drive/folders",
    googleDriveSetFoldersAPIHandler
  );

  app.listen(port, () => {
    logger.info(`Connectors API listening on port ${port}`);
  });
}
