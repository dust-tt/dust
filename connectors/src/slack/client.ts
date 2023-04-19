import { Connection, Client } from '@temporalio/client';
import { getTeamIdWorkflow, slack_workflow_fullsync, slackSyncOneThreadWorkflow } from './workflows';
import { nanoid } from 'nanoid';
import { SlackConfig, DustConfig } from './interface';

async function getTemporalClient() : Promise<Client> {
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

  return client;
}

export async function triggerSlackSync(slackConfig: SlackConfig, dustConfig: DustConfig) {

  const client = await getTemporalClient();

  const handle = await client.workflow.start(slack_workflow_fullsync, {
    // type inference works! args: [name: string]
    args: [slackConfig, dustConfig],
    taskQueue: 'hello-world',
    // in practice, use a meaningful business ID, like customerId or transactionId
    workflowId: 'workflow-' + nanoid(),
  });

  // optional: wait for client result
  console.log(await handle.result()); // Hello, Temporal!
}


export async function getTeamInfo(slackConfig: SlackConfig) {

  const client = await getTemporalClient();

  const handle = await client.workflow.start(getTeamIdWorkflow, {
    // type inference works! args: [name: string]
    args: [slackConfig],
    taskQueue: 'hello-world',
    // in practice, use a meaningful business ID, like customerId or transactionId
    workflowId: 'workflow-' + nanoid(),
  });

  return await handle.result();
}

export async function syncOneThread(slackConfig: SlackConfig, dustConfig: DustConfig, channelId: string, threadId: string) {

  const client = await getTemporalClient();

  const handle = await client.workflow.start(slackSyncOneThreadWorkflow, {
    // type inference works! args: [name: string]
    args: [slackConfig, dustConfig, channelId, threadId],
    taskQueue: 'hello-world',
    // in practice, use a meaningful business ID, like customerId or transactionId
    workflowId: 'workflow-' + nanoid(),
  });

  return await handle.result();
}
