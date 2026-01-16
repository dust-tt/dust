import { upsertProPlans } from "@app/lib/plans/pro_plans";

/**
 * Seeds pro plans for test environments.
 * Called once from vite.globalSetup.ts before tests run to avoid race conditions
 * when parallel test processes try to create the same plans simultaneously.
 */
async function main() {
  await upsertProPlans();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
