import { front_sequelize } from "@app/lib/databases";

async function main() {
  console.log("dropping payment_status column from subscriptions table");
  await front_sequelize.query(
    `ALTER TABLE "subscriptions" DROP COLUMN "paymentStatus"`
  );
}

main()
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
