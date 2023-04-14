import {
  User,
  App,
  Dataset,
  Provider,
  Key,
  DataSource,
  Run,
} from "@app/lib/models";
import { personalWorkspace } from "@app/lib/auth";

async function addWorkspaceToObject(
  object: App | Dataset | Provider | Key | DataSource | Run
) {
  if (object.workspaceId) {
    console.log(`o ${object.id} ${object.userId} ${object.workspaceId}`);
    return;
  }

  const user = await User.findOne({
    where: {
      id: object.userId,
    },
  });
  if (!user) {
    throw new Error(`User id=${object.userId} not found`);
  }
  const ownerRes = await personalWorkspace(user);

  if (ownerRes.isErr()) {
    throw new Error(`Workspace not found for user id=${object.userId}`);
  }

  const owner = ownerRes.value;

  await (object as any).update({
    workspaceId: owner.id,
  });
  console.log(`+ ${object.id} ${user.id} ${owner.id}`);
}

async function updateObjects(
  objects: App[] | Dataset[] | Provider[] | Key[] | DataSource[] | Run[]
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
  let apps = await App.findAll();
  await updateObjects(apps);
}

async function updateDatasets() {
  let datasets = await Dataset.findAll();
  await updateObjects(datasets);
}

async function updateProviders() {
  let providers = await Provider.findAll();
  await updateObjects(providers);
}

async function updateKeys() {
  let keys = await Key.findAll();
  await updateObjects(keys);
}

async function updateDataSources() {
  let dataSources = await DataSource.findAll();
  await updateObjects(dataSources);
}

async function updateRuns() {
  let runs = await Run.findAll();
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
