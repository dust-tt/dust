import { fetchConsumptionTopModels } from "@app/lib/api/analytics/consumption/top_models";

import { createConsumptionTopRoute } from "./top";

const app = createConsumptionTopRoute({
  fetcher: fetchConsumptionTopModels,
  failureMessage: "Failed to retrieve top models.",
});

export default app;
