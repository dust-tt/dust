import { fetchConsumptionTopReasoningEfforts } from "@app/lib/api/analytics/consumption/top_reasoning_efforts";

import { createConsumptionTopRoute } from "./top";

const app = createConsumptionTopRoute({
  fetcher: fetchConsumptionTopReasoningEfforts,
  failureMessage: "Failed to retrieve top reasoning efforts.",
});

export default app;
