import bodyParser from "body-parser";
import express from "express";
import minimist from "minimist";

import { createConnectorAPIHandler } from "@connectors/api/createConnector";
import { stopConnectorAPIHandler } from "@connectors/api/stopConnector";
import { getConnectorStatusAPIHandler } from "@connectors/api/syncStatus";
import logger from "@connectors/logger/logger";
import { authMiddleware } from "@connectors/middleware/auth";

import { resumeConnectorAPIHandler } from "./api/resumeConnector";

const argv = minimist(process.argv.slice(2));
if (!argv.p) {
  throw new Error("Port is required: -p <port>");
}
const port = argv.p;

const app = express();

app.use(authMiddleware);
app.use(bodyParser.json());

app.post("/connectors/create/:connector_provider", createConnectorAPIHandler);
app.post("/connectors/stop/:connector_provider", stopConnectorAPIHandler);
app.post("/connectors/resume/:connector_provider", resumeConnectorAPIHandler);
app.get("/connectors/sync_status/:connector_id", getConnectorStatusAPIHandler);

app.listen(port, () => {
  logger.info(`Connectors API listening on port ${port}`);
});
