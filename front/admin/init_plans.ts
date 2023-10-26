import { upsertFreePlans } from "@app/lib/plans/free_plans";
import { upsertProPlans } from "@app/lib/plans/pro_plans";

async function main() {
  await upsertFreePlans();
  await upsertProPlans();
  process.exit(0);
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
