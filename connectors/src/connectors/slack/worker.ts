// /temporal/src/worker.ts
import { Worker } from '@temporalio/worker';
import * as activities from './slack';

async function run() {
  const worker = await Worker.create({
    workflowsPath: require.resolve('./workflow'), // passed to Webpack for bundling
    activities, // directly imported in Node.js
    taskQueue: 'slack-sync',
  });
  await worker.run();
}

run().catch((err) => console.log(err));
