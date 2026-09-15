import { fetchConsumptionTopTriggers } from "@app/lib/api/analytics/consumption/top_triggers";

import { createConsumptionTopRoute } from "./top";

const app = createConsumptionTopRoute({
  fetcher: fetchConsumptionTopTriggers,
  failureMessage: "Failed to retrieve top triggers.",
});

export default app;
