import { Worker } from '@temporalio/worker';
import * as full_sync_activities from './slack/full_sync';
import * as sync_thread_activities from './slack/sync_thread';
import * as info_activities from './slack/info';


async function run() {
  // Step 1: Register Workflows and Activities with the Worker and connect to
  // the Temporal server.
  const worker = await Worker.create({
    workflowsPath: require.resolve('./slack/workflows'),
    activities:{...full_sync_activities, ...sync_thread_activities, ...info_activities},
    taskQueue: 'hello-world',
    debugMode: true,
    showStackTraceSources: true,
  });
  // Worker connects to localhost by default and uses console.error for logging.
  // Customize the Worker by passing more options to create():
  // https://typescript.temporal.io/api/classes/worker.Worker
  // If you need to configure server connection parameters, see docs:
  // https://docs.temporal.io/typescript/security#encryption-in-transit-with-mtls

  // Step 2: Start accepting tasks on the `hello-world` queue
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
