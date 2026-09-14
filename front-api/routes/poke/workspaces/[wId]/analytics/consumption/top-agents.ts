import { fetchConsumptionTopAgents } from "@app/lib/api/analytics/consumption/top_agents";

import { createConsumptionTopRoute } from "./top";

const app = createConsumptionTopRoute({
  fetcher: fetchConsumptionTopAgents,
  failureMessage: "Failed to retrieve top agents.",
});

export default app;
