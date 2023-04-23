import { Worker } from '@temporalio/worker';
import * as activities from './slack.js';

async function run() : Promise<void> {
  const worker = await Worker.create({
    workflowsPath: require.resolve('./workflow'), // passed to Webpack for bundling
    activities, // directly imported in Node.js
    taskQueue: 'slack-sync',
  });
  await worker.run();
  
  return ;
}

run().catch((err) => console.log(err));
