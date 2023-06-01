import { Sequelize } from "sequelize";

const { CORE_DATABASE_URI, LIVE = false } = process.env;

async function main() {
  const core_sequelize = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });
  console.log("Retrieving core runs");
  const data = await core_sequelize.query(
    "SELECT id, run_id, created, status_json FROM runs"
  );
  const coreRuns = data[0];
  console.log(`Retrieved ${coreRuns.length}`);

  console.log("Filtering runs with `running` status");
  const runningRuns = coreRuns.filter((r: any) => {
    const status = JSON.parse(r.status_json);

    if (status.run === "running") {
      const created = new Date(parseInt(r.created));
      const now = new Date();
      const diff = now.getTime() - created.getTime();
      const diffInHours = diff / (1000 * 60 * 60);
      if (diffInHours > 2) {
        return true;
      } else {
        console.log(`Skipping: ${r.run_id} ${created}`);
      }
    }
    return false;
  });

  console.log("Found running runs > 1h: ", runningRuns.length);

  console.log("Chunking");
  const chunkSize = 16;
  const chunks = [];
  for (let i = 0; i < runningRuns.length; i += chunkSize) {
    chunks.push(runningRuns.slice(i, i + chunkSize));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    await Promise.all(
      chunk.map((r: any) => {
        const status = JSON.parse(r.status_json);
        if (status.run !== "running") {
          throw new Error("Not running");
        }
        status.run = "errored";
        const statusJson = JSON.stringify(status);
        // console.log(statusJson);

        if (LIVE) {
          return core_sequelize.query(
            `UPDATE runs SET "status_json" = :statusJson WHERE id = :id`,
            {
              replacements: {
                statusJson: statusJson,
                id: r.id,
              },
            }
          );
        } else {
          console.log(`Would have updated: ${r.run_id}`);
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
