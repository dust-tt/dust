import { upsertCreditPricedPlans } from "@app/lib/plans/credit_priced_plans";
import { upsertFreePlans } from "@app/lib/plans/free_plans";
import { upsertProPlans } from "@app/lib/plans/pro_plans";

async function main() {
  const planCode = process.argv[2];

  if (planCode) {
    console.log(`Upserting plan: ${planCode}`);
  } else {
    console.log("Upserting all plans");
  }

  await upsertFreePlans(planCode);
  await upsertProPlans(planCode);
  await upsertCreditPricedPlans(planCode);
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
