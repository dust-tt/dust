import { frontSequelize } from "@app/lib/resources/storage";

async function main() {
  console.log("dropping gens_templates table");
  await frontSequelize.query(`DROP TABLE IF EXISTS gens_templates`);
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
