import { fetchConsumptionTopTools } from "@app/lib/api/analytics/consumption/top_tools";

import { createConsumptionTopRoute } from "./top";

const app = createConsumptionTopRoute({
  fetcher: fetchConsumptionTopTools,
  failureMessage: "Failed to retrieve top tools.",
});

export default app;
