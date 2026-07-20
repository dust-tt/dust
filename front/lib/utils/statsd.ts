import logger from "@app/logger/logger";
import { StatsD } from "hot-shots";

let statsDClient: StatsD | undefined = undefined;

export function getStatsDClient(): StatsD {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!statsDClient) {
    statsDClient = new StatsD({
      globalTags: process.env.DD_ENTITY_ID
        ? { "dd.internal.entity_tag": process.env.DD_ENTITY_ID }
        : {},
      // Without an errorHandler, hot-shots emits "error" on its dgram socket with no listener
      // attached, which crashes the process on the rare send failure. Metrics are best-effort,
      // so log and move on.
      errorHandler: (err) => {
        logger.warn({ err }, "StatsD send error");
      },
    });
  }
  return statsDClient;
}
