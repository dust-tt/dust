import { fetchConsumptionTopSkills } from "@app/lib/api/analytics/consumption/top_skills";

import { createConsumptionTopRoute } from "./top";

const app = createConsumptionTopRoute({
  fetcher: fetchConsumptionTopSkills,
  failureMessage: "Failed to retrieve top skills.",
});

export default app;
