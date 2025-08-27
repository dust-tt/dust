import { Context } from "@temporalio/activity";
import type { ConnectionOptions } from "@temporalio/client";
import { Client, Connection, WorkflowNotFoundError } from "@temporalio/client";
import { NativeConnection } from "@temporalio/worker";
import fs from "fs-extra";

import logger from "@connectors/logger/logger";
import type { ModelId } from "@connectors/types";

// Assuming one cached workflows takes 2MB on average,
// we can cache 292 workflows in 4096MB, which is the max heap size
// we give to our temporal workers.
// Add some margin to it, so we don't hit the limit, and we get to 200.
export const TEMPORAL_MAXED_CACHED_WORKFLOWS = 200;

// This is a singleton connection to the Temporal server.
let TEMPORAL_CLIENT: Client | undefined;

const CONNECTOR_ID_CACHE: Record<string, ModelId> = {};

export async function getTemporalClient(): Promise<Client> {
  if (TEMPORAL_CLIENT) {
    return TEMPORAL_CLIENT;
  }
  const connectionOptions = await getConnectionOptions();
  const connection = await Connection.connect(connectionOptions);
  const client = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE,
  });
  TEMPORAL_CLIENT = client;

  return client;
}

async function getConnectionOptions(): Promise<
  | {
      address: string;
      tls: ConnectionOptions["tls"];
    }
  | Record<string, never>
> {
  const { NODE_ENV = "development" } = process.env;
  const isDeployed = ["production", "staging"].includes(NODE_ENV);

  if (!isDeployed) {
    return {};
  }

  const { TEMPORAL_CERT_PATH, TEMPORAL_CERT_KEY_PATH, TEMPORAL_NAMESPACE } =
    process.env;
  if (!TEMPORAL_CERT_PATH || !TEMPORAL_CERT_KEY_PATH || !TEMPORAL_NAMESPACE) {
    throw new Error(
      "TEMPORAL_CERT_PATH, TEMPORAL_CERT_KEY_PATH and TEMPORAL_NAMESPACE are required " +
        `when NODE_ENV=${NODE_ENV}, but not found in the environment`
    );
  }

  const cert = await fs.readFile(TEMPORAL_CERT_PATH);
  const key = await fs.readFile(TEMPORAL_CERT_KEY_PATH);

  return {
    address: `${TEMPORAL_NAMESPACE}.tmprl.cloud:7233`,
    tls: {
      clientCertPair: {
        crt: cert,
        key,
      },
    },
  };
}

export async function getTemporalWorkerConnection(): Promise<{
  connection: NativeConnection;
  namespace: string | undefined;
}> {
  const connectionOptions = await getConnectionOptions();
  const connection = await NativeConnection.connect(connectionOptions);
  return { connection, namespace: process.env.TEMPORAL_NAMESPACE };
}

export async function getConnectorId(
  workflowRunId: string
): Promise<ModelId | null> {
  if (!CONNECTOR_ID_CACHE[workflowRunId]) {
    const client = await getTemporalClient();
    const workflowHandle = client.workflow.getHandle(workflowRunId);
    const described = await workflowHandle.describe();
    if (described.memo && described.memo.connectorId) {
      if (typeof described.memo.connectorId === "number") {
        CONNECTOR_ID_CACHE[workflowRunId] = described.memo.connectorId;
      } else if (typeof described.memo.connectorId === "string") {
        CONNECTOR_ID_CACHE[workflowRunId] = parseInt(
          described.memo.connectorId,
          10
        );
      }
    }
  }
  return CONNECTOR_ID_CACHE[workflowRunId] || null;
}

export async function cancelWorkflow(workflowId: string) {
  const client = await getTemporalClient();
  try {
    const workflowHandle = client.workflow.getHandle(workflowId);
    await workflowHandle.cancel();
    return true;
  } catch (e) {
    if (!(e instanceof WorkflowNotFoundError)) {
      throw e;
    }
  }
  return false;
}

export async function terminateWorkflow(workflowId: string, reason?: string) {
  const client = await getTemporalClient();
  try {
    const workflowHandle = client.workflow.getHandle(workflowId);
    await workflowHandle.terminate(reason);
    return true;
  } catch (e) {
    if (!(e instanceof WorkflowNotFoundError)) {
      throw e;
    }
  }
  return false;
}

export async function terminateAllWorkflowsForConnectorId(
  connectorId: ModelId
) {
  const client = await getTemporalClient();

  const workflowInfos = client.workflow.list({
    query: `ExecutionStatus = 'Running' AND connectorId = ${connectorId}`,
  });

  logger.info(
    {
      connectorId,
    },
    "About to terminate all workflows for connectorId"
  );

  for await (const handle of workflowInfos) {
    logger.info(
      { connectorId, workflowId: handle.workflowId },
      "Terminating Temporal workflow"
    );

    const workflowHandle = client.workflow.getHandle(handle.workflowId);
    try {
      await workflowHandle.terminate();
    } catch (err) {
      // Intentionally ignore errors that indicate the workflow no longer exists.
      if (err instanceof WorkflowNotFoundError) {
        continue;
      }
      throw err;
    }
  }

  return;
}

// This function allows to heartbeat back to the temporal workflow, but also
// awaits a temporal sleep(0), which allows to throw an exception if the activity should be cancelled.
export async function heartbeat() {
  try {
    Context.current();
  } catch (error) {
    // If we're not in a temporal context, Context.current() will throw
    // In this case, we just return without doing anything
    // This allows the function to be called safely outside of temporal activities
    return;
  }
  Context.current().heartbeat();
  await Context.current().sleep(0);
}
