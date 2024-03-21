import { Sequelize } from "sequelize";

import { Run } from "@app/lib/models";
import { frontSequelize } from "@app/lib/resources/storage";

const { CORE_DATABASE_URI } = process.env;

async function main() {
  const core_sequelize = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });
  console.log("Retrieving core runs");
  const data = await core_sequelize.query("SELECT * FROM runs");
  const core_runs_rows = data[0];
  console.log(`Retrieved ${core_runs_rows.length}`);

  console.log("Generating runById");
  const runById = {} as {
    [key: string]: {
      run_id: string;
      run_type: string;
      project: string;
      created: string;
    };
  };
  core_runs_rows.forEach((r) => {
    runById[(r as any).run_id] = r as any;
  });

  console.log("Retrieving front runs");
  const frontRuns = await Run.findAll();

  console.log("Chunking");
  const chunkSize = 16;
  const chunks = [];
  for (let i = 0; i < frontRuns.length; i += chunkSize) {
    chunks.push(frontRuns.slice(i, i + chunkSize));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    await Promise.all(
      chunk.map((r) => {
        const dustRun = runById[r.dustRunId];
        if (dustRun) {
          return frontSequelize.query(
            `UPDATE runs SET "createdAt" = :createdAt WHERE id = :id`,
            {
              replacements: {
                createdAt: new Date(parseInt(dustRun.created)),
                id: r.id,
              },
            }
          );
        }
      })
    );
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
