import { withCreditPricedPlan } from "@front-api/middlewares/with_credit_priced_plan";

export const ensureSlackWorkflowsPlan = withCreditPricedPlan({
  message: "Managing Slack workflows is only available on credit-priced plans.",
});
