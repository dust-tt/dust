// @ts-expect-error old migration code kept for reference

import { personalWorkspace } from "@app/lib/auth";
import { User } from "@app/lib/models/user";
import {
  AppModel,
  Dataset,
  Provider,
} from "@app/lib/resources/storage/models/apps";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { RunModel } from "@app/lib/resources/storage/models/runs";

async function addWorkspaceToObject(
  object: AppModel | Dataset | Provider | KeyModel | DataSourceModel | RunModel
) {
  if (object.workspaceId) {
    // @ts-expect-error old migration code kept for reference
    console.log(`o ${object.id} ${object.userId} ${object.workspaceId}`);
    return;
  }

  const user = await User.findOne({
    where: {
      // @ts-expect-error old migration code kept for reference
      id: object.userId,
    },
  });
  if (!user) {
    // @ts-expect-error old migration code kept for reference
    throw new Error(`User id=${object.userId} not found`);
  }
  const ownerRes = await personalWorkspace(user);

  if (ownerRes.isErr()) {
    // @ts-expect-error old migration code kept for reference
    throw new Error(`Workspace not found for user id=${object.userId}`);
  }

  const owner = ownerRes.value;

  await (object as any).update({
    workspaceId: owner.id,
  });
  console.log(`+ ${object.id} ${user.id} ${owner.id}`);
}

async function updateObjects(
  objects:
    | AppModel[]
    | Dataset[]
    | Provider[]
    | KeyModel[]
    | DataSourceModel[]
    | RunModel[]
) {
  const chunks = [];
  for (let i = 0; i < objects.length; i += 16) {
    chunks.push(objects.slice(i, i + 16));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    await Promise.all(
      chunk.map((o) => {
        return addWorkspaceToObject(o);
      })
    );
  }
}

async function updateApps() {
  const apps = await AppModel.findAll();
  await updateObjects(apps);
}

async function updateDatasets() {
  const datasets = await Dataset.findAll();
  await updateObjects(datasets);
}

async function updateProviders() {
  const providers = await Provider.findAll();
  await updateObjects(providers);
}

async function updateKeys() {
  const keys = await KeyModel.findAll();
  await updateObjects(keys);
}

async function updateDataSources() {
  const dataSources = await DataSourceModel.findAll();
  await updateObjects(dataSources);
}

async function updateRuns() {
  const runs = await RunModel.findAll();
  await updateObjects(runs);
}

async function main() {
  console.log(`Update Apps...`);
  await updateApps();
  console.log(`Update Datasets...`);
  await updateDatasets();
  console.log(`Update Providers...`);
  await updateProviders();
  console.log(`Update Keys...`);
  await updateKeys();
  console.log(`Update DataSources...`);
  await updateDataSources();
  console.log(`Update Runs...`);
  await updateRuns();
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
