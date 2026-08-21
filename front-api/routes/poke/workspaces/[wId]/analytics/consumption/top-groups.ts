import { fetchConsumptionTopGroups } from "@app/lib/api/analytics/consumption/top_groups";

import { createConsumptionTopRoute } from "./top";

const app = createConsumptionTopRoute({
  fetcher: fetchConsumptionTopGroups,
  failureMessage: "Failed to retrieve top groups.",
});

export default app;
