import { front_sequelize } from "@app/lib/databases";

async function main() {
  console.log("dropping gens_templates table");
  await front_sequelize.query(`DROP TABLE IF EXISTS gens_templates`);
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
