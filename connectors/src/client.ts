import { Connection, Client } from '@temporalio/client';
import { slack_workflow } from './workflows';
import { nanoid } from 'nanoid';
import { SlackConfig, DustConfig } from './slack/slack';


export async function triggerSlackSync(slackConfig: SlackConfig, dustConfig:DustConfig) {
  // Connect to the default Server location (localhost:7233)
  const connection = await Connection.connect({});
  // In production, pass options to configure TLS and other settings:
  // {
  //   address: 'foo.bar.tmprl.cloud',
  //   tls: {}
  // }

  const client = new Client({
    connection,
    // namespace: 'foo.bar', // connects to 'default' namespace if not specified
  });

  const handle = await client.workflow.start(slack_workflow, {
    // type inference works! args: [name: string]
    args: [slackConfig, dustConfig],
    taskQueue: 'hello-world',
    // in practice, use a meaningful business ID, like customerId or transactionId
    workflowId: 'workflow-' + nanoid(),
  });
  console.log(`Started workflow ${handle.workflowId}`);

  // optional: wait for client result
  console.log(await handle.result()); // Hello, Temporal!
}

