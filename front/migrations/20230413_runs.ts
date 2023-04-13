import { App, Run } from "@app/lib/models";
import { Sequelize } from "sequelize";

const { CORE_DATABASE_URI } = process.env;

async function main() {
  const core_sequelize = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });
  const data = await core_sequelize.query("SELECT * FROM runs");
  const core_runs_rows = data[0];

  const runById = core_runs_rows.reduce(
    (acc: any, r: any) => ({
      ...acc,
      [r.run_id]: r,
    }),
    {}
  ) as { [key: number]: { run_id: string; run_type: string; project: number } };
  const allRunIds = core_runs_rows.map((r: any) => r.run_id);

  const existingFrontRuns = await Run.findAll();
  const alreadyBackfilledRunIds = new Set(
    existingFrontRuns.map((r) => r.dustRunId)
  );

  const runIdsToBackfill = allRunIds.filter(
    (r) => !alreadyBackfilledRunIds.has(r)
  );
  const projectIdsToBackfill = Array.from(
    new Set(runIdsToBackfill.map((r) => runById[r].project)).values()
  );

  const appsToBackfill = await App.findAll({
    where: {
      dustAPIProjectId: projectIdsToBackfill,
    },
  });

  const appByProjectId = appsToBackfill.reduce(
    (acc: any, a: any) => ({
      ...acc,
      [a.dustAPIProjectId]: a,
    }),
    {}
  ) as { [key: number]: App };

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
