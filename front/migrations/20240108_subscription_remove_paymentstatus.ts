import { frontSequelize } from "@app/lib/resources/storage";

async function main() {
  console.log("dropping payment_status column from subscriptions table");
  await frontSequelize.query(
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
