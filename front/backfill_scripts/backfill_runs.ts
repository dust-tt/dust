import { App, Run } from "@app/lib/models";
import { Sequelize } from "sequelize";

const { CORE_DATABASE_URI } = process.env;

async function main() {
  const core_sequelize = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });
  const data = await core_sequelize.query("SELECT * FROM runs");
  const rows = data[0];
  const projectIdByRunId = rows.reduce(
    (acc: any, r: any) => ({
      ...acc,
      [r.run_id]: r.project,
    }),
    {}
  ) as { [key: number]: number };
  const allRunIds = rows.map((r: any) => r.run_id);
  const existingRuns = await Run.findAll();
  const existingRunIds = new Set(existingRuns.map((r) => r.dustRunId));
  const runIdsToBackfill = allRunIds.filter((r) => !existingRunIds.has(r));
  const projectIdsToBackfill = Array.from(
    new Set(runIdsToBackfill.map((r) => projectIdByRunId[r])).values()
  );
  const apps = await App.findAll({
    where: {
      dustAPIProjectId: projectIdsToBackfill,
    },
  });
  const appIdByProjectId = apps.reduce(
    (acc: any, a: any) => ({
      ...acc,
      [a.dustAPIProjectId]: a.id,
    }),
    {}
  ) as { [key: number]: number };
  const ownerIdByProjectId = apps.reduce(
    (acc: any, a: any) => ({
      ...acc,
      [a.dustAPIProjectId]: a.userId,
    }),
    {}
  ) as { [key: number]: number };

  console.log(`Backfilling ${runIdsToBackfill.length} runs`);
  const runsToCreate = runIdsToBackfill
    .map((runId) => {
      const projectId = projectIdByRunId[runId];
      const ownerId = ownerIdByProjectId[projectId];
      const appId = appIdByProjectId[projectId];
      if (!appId) {
        console.warn(`No app found for project ${projectId}`);
      }
      if (!ownerId) {
        console.warn(`No owner found for project ${projectId}`);
      }
      return {
        dustRunId: runId,
        appId,
        userId: ownerId,
      };
    })
    .filter((r) => r.appId && r.userId);
  await Run.bulkCreate(runsToCreate);
}

main()
  .then(() => {
    console.log("Done");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
