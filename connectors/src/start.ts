import minimist from "minimist";

import { startServer } from "@connectors/api_server";
import { runConfluenceWorker } from "@connectors/connectors/confluence/temporal/worker";

import { runGithubWorker } from "./connectors/github/temporal/worker";
import { runGoogleWorker } from "./connectors/google_drive/temporal/worker";
import { runNotionWorker } from "./connectors/notion/temporal/worker";
import { runSlackWorker } from "./connectors/slack/temporal/worker";
import { runWebCrawlerWorker } from "./connectors/webcrawler/temporal/worker";
import { errorFromAny } from "./lib/error";
import logger from "./logger/logger";

const argv = minimist(process.argv.slice(2));
if (!argv.p) {
  throw new Error("Port is required: -p <port>");
}
const port = argv.p;

startServer(port);

runConfluenceWorker().catch((err) =>
  logger.error(errorFromAny(err), "Error running confluence worker")
);
runSlackWorker().catch((err) =>
  logger.error(errorFromAny(err), "Error running slack worker")
);
runNotionWorker().catch((err) =>
  logger.error(errorFromAny(err), "Error running notion worker")
);
runGithubWorker().catch((err) =>
  logger.error(errorFromAny(err), "Error running github worker")
);
runGoogleWorker().catch((err) =>
  logger.error(errorFromAny(err), "Error running notion worker")
);
runWebCrawlerWorker().catch((err) =>
  logger.error(errorFromAny(err), "Error running webcrawler worker")
);
