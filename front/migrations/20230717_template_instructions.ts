import { GensTemplate } from "@app/lib/models";
import { Sequelize } from "sequelize";

const { FRONT_DATABASE_URI, LIVE = true } = process.env;

async function main() {
  const core_sequelize = new Sequelize(FRONT_DATABASE_URI as string, {
    logging: false,
  });
  // take all the GensTemplate, set instructions2 to the concatenation of all the values in instructions

  const gensTemplates = (
    await core_sequelize.query(`SELECT * FROM "gens_templates"`)
  )[0] as GensTemplate[];

  for (const gensTemplate of gensTemplates) {
    const instructions = gensTemplate?.instructions || [];
    const instructions2 = instructions.join("\n");
    console.log(
      "Updating instructions2 for ",
      gensTemplate.id,
      "to",
      instructions2
    );
    if (LIVE) {
      await core_sequelize.query(
        `UPDATE "gens_templates" SET "instructions2" = :instructions2 WHERE id = :id`,
        {
          replacements: {
            instructions2,
            id: gensTemplate.id,
          },
        }
      );
    }
  }
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
