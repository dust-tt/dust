import { App, Run } from "@app/lib/models";
import { Sequelize } from "sequelize";

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
  const runById = core_runs_rows.reduce(
    (acc: any, r: any) => ({
      ...acc,
      [r.run_id]: r,
    }),
    {}
  ) as { [key: string]: { run_id: string; run_type: string; project: number } };
  console.log("Generating allRunIds");
  const allRunIds = core_runs_rows.map((r: any) => r.run_id);

  console.log("Retrieving existing front runs");
  const existingFrontRuns = await Run.findAll();
  console.log("Generating alreadyBackfilledRunIds");
  const alreadyBackfilledRunIds = new Set(
    existingFrontRuns.map((r) => r.dustRunId)
  );

  console.log("Generating runIdsToBackfill");
  const runIdsToBackfill = allRunIds.filter(
    (r) => !alreadyBackfilledRunIds.has(r)
  );
  console.log("Generating projectIdsToBackfill");
  const projectIdsToBackfill = Array.from(
    new Set(runIdsToBackfill.map((r) => runById[r].project)).values()
  );

  console.log("Retrieving apps to backfill");
  const appsToBackfill = await App.findAll({
    where: {
      dustAPIProjectId: projectIdsToBackfill,
    },
  });

  console.log("Generating appByProjectId");
  const appByProjectId = appsToBackfill.reduce(
    (acc: any, a: any) => ({
      ...acc,
      [a.dustAPIProjectId]: a,
    }),
    {}
  ) as { [key: number]: App };

  console.log("Chunking");
  const chunkSize = 16;
  const chunks = [];
  for (let i = 0; i < runIdsToBackfill.length; i += chunkSize) {
    chunks.push(runIdsToBackfill.slice(i, i + chunkSize));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    const runsToCreate = chunk
      .map((runId) => {
        const projectId = runById[runId].project;
        const runType = runById[runId].run_type;
        const app = appByProjectId[projectId];
        if (!app) {
          console.warn(`No app found for project ${projectId}`);
        }
        const userId = app?.userId;
        const appId = app?.id;
        return {
          dustRunId: runId,
          appId,
          userId,
          runType,
        };
      })
      .filter((r) => r.appId && r.userId);

    await Run.bulkCreate(runsToCreate);
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
