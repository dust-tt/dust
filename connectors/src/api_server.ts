import bodyParser from "body-parser";
import express from "express";
import minimist from "minimist";

import { createConnectorAPIHandler } from "./api/createConnector";
import logger from "./logger/logger";
import { authMiddleware } from "./middleware/auth";

const argv = minimist(process.argv.slice(2));
if (!argv.p) {
  throw new Error("Port is required: -p <port>");
}
const port = argv.p;

const app = express();

app.use(authMiddleware);
app.use(bodyParser.json());

app.post("/connectors/create/:connector_provider", createConnectorAPIHandler);

app.listen(port, () => {
  logger.info(`Connectors API listening on port ${port}`);
});
