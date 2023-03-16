import { Connection, Client } from '@temporalio/client';
import { slack_workflow } from './workflows';
import { nanoid } from 'nanoid';

async function run() {
  // Connect to the default Server location (localhost:7233)
  const connection = await Connection.connect();
  // In production, pass options to configure TLS and other settings:
  // {
  //   address: 'foo.bar.tmprl.cloud',
  //   tls: {}
  // }

  const client = new Client({
    connection,
    // namespace: 'foo.bar', // connects to 'default' namespace if not specified
  });
  if (!process.env.SLACK_TOKEN) {
    throw new Error('Var env SLACK_TOKEN must be defined. You can set it to a oauth access token or a bot token')
  }

  const handle = await client.workflow.start(slack_workflow, {
    // type inference works! args: [name: string]
    args: [process.env.SLACK_TOKEN],
    taskQueue: 'hello-world',
    // in practice, use a meaningful business ID, like customerId or transactionId
    workflowId: 'workflow-' + nanoid(),
  });
  console.log(`Started workflow ${handle.workflowId}`);

  // optional: wait for client result
  console.log(await handle.result()); // Hello, Temporal!
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
