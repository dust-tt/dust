import { fetchConsumptionTopSources } from "@app/lib/api/analytics/consumption/top_sources";

import { createConsumptionTopRoute } from "./top";

const app = createConsumptionTopRoute({
  fetcher: fetchConsumptionTopSources,
  failureMessage: "Failed to retrieve top sources.",
});

export default app;
