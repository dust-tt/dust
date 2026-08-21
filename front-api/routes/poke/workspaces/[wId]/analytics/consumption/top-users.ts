import { fetchConsumptionTopUsers } from "@app/lib/api/analytics/consumption/top_users";

import { createConsumptionTopRoute } from "./top";

const app = createConsumptionTopRoute({
  fetcher: fetchConsumptionTopUsers,
  failureMessage: "Failed to retrieve top users.",
});

export default app;
