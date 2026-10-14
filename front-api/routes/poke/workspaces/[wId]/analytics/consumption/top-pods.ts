import { fetchConsumptionTopPods } from "@app/lib/api/analytics/consumption/top_pods";

import { createConsumptionTopRoute } from "./top";

const app = createConsumptionTopRoute({
  fetcher: fetchConsumptionTopPods,
  failureMessage: "Failed to retrieve top pods.",
});

export default app;
