import { getStatsDClient } from "@app/lib/utils/statsd";
import { makeScript } from "@app/scripts/helpers";
import { promisify } from "util";

makeScript({}, async ({ execute }, logger) => {
  const metricName = "statsd.dummy.count";
  if (!execute) {
    logger.info({ metricName }, "Would send one dummy StatsD metric");
    return;
  }

  const client = getStatsDClient();
  const increment = promisify(client.increment.bind(client));
  const close = promisify(client.close.bind(client));

  try {
    await increment(metricName, 1);
  } finally {
    await close();
  }

  logger.info({ metricName }, "Sent one dummy StatsD metric");
});
