import minimist from "minimist";

import { startServer } from "@connectors/api_server";
import { runBigQueryWorker } from "@connectors/connectors/bigquery/temporal/worker";
import { runConfluenceWorker } from "@connectors/connectors/confluence/temporal/worker";
import { runGongWorker } from "@connectors/connectors/gong/temporal/worker";
import { runMicrosoftWorker } from "@connectors/connectors/microsoft/temporal/worker";
import { runSalesforceWorker } from "@connectors/connectors/salesforce/temporal/worker";
import { runSnowflakeWorker } from "@connectors/connectors/snowflake/temporal/worker";

import { initializeDiscordCommands } from "./api/webhooks/discord/startup";
import { runGithubWorker } from "./connectors/github/temporal/worker";
import { runGoogleWorkers } from "./connectors/google_drive/temporal/worker";
import { runIntercomWorker } from "./connectors/intercom/temporal/worker";
import { runNotionWorker } from "./connectors/notion/temporal/worker";
import { runSlackWorker } from "./connectors/slack/temporal/worker";
import { runWebCrawlerWorker } from "./connectors/webcrawler/temporal/worker";
import { runZendeskWorkers } from "./connectors/zendesk/temporal/worker";
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
runZendeskWorkers().catch((err) =>
  logger.error(errorFromAny(err), "Error running zendesk worker")
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
runBigQueryWorker().catch((err) =>
  logger.error(errorFromAny(err), "Error running bigquery worker")
);
runSalesforceWorker().catch((err) =>
  logger.error(errorFromAny(err), "Error running salesforce worker")
);
runGongWorker().catch((err) =>
  logger.error(errorFromAny(err), "Error running gong worker")
);

initializeDiscordCommands().catch((err) =>
  logger.error(errorFromAny(err), "Error initializing Discord commands")
);
