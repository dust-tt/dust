import { StatsD } from "hot-shots";

let statsDClient: StatsD | undefined = undefined;

export function getStatsDClient(): StatsD {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!statsDClient) {
    statsDClient = new StatsD({
      globalTags: process.env.DD_ENTITY_ID
        ? { "dd.internal.entity_tag": process.env.DD_ENTITY_ID }
        : {},
    });
  }
  return statsDClient;
}
