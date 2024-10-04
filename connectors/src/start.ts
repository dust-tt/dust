import minimist from "minimist";

import { startServer } from "@connectors/api_server";
import { runConfluenceWorker } from "@connectors/connectors/confluence/temporal/worker";
import { runMicrosoftWorker } from "@connectors/connectors/microsoft/temporal/worker";
import { runSnowflakeWorker } from "@connectors/connectors/snowflake/temporal/worker";

import { runGithubWorker } from "./connectors/github/temporal/worker";
import { runGoogleWorkers } from "./connectors/google_drive/temporal/worker";
import { runIntercomWorker } from "./connectors/intercom/temporal/worker";
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
// Disabled on purpose to avoid heavy load on Notion API in dev
// runNotionGarbageCollectWorker().catch((err) =>
//   logger.error(errorFromAny(err), "Error running notion gc worker")
// );
runGithubWorker().catch((err) =>
  logger.error(errorFromAny(err), "Error running github worker")
);
runGoogleWorkers().catch((err) =>
  logger.error(errorFromAny(err), "Error running google worker")
);
runIntercomWorker().catch((err) =>
  logger.error(errorFromAny(err), "Error running intercom worker")
);
runWebCrawlerWorker().catch((err) =>
  logger.error(errorFromAny(err), "Error running webcrawler worker")
);
runMicrosoftWorker().catch((err) =>
  logger.error(errorFromAny(err), "Error running microsoft worker")
);
runSnowflakeWorker().catch((err) =>
  logger.error(errorFromAny(err), "Error running snowflake worker")
);
