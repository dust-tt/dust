import { fetchConsumptionTopApiKeys } from "@app/lib/api/analytics/consumption/top_api_keys";

import { createConsumptionTopRoute } from "./top";

const app = createConsumptionTopRoute({
  fetcher: fetchConsumptionTopApiKeys,
  failureMessage: "Failed to retrieve top API keys.",
});

export default app;
