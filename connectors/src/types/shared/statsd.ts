import { StatsD } from "hot-shots";

let statsDClient: StatsD | undefined ;

export function getStatsDClient(): StatsD {
  if (!statsDClient) {
    statsDClient = new StatsD();
  }
  return statsDClient;
}
