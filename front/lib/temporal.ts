import { Context } from "@temporalio/activity";
import type {
  ConnectionOptions,
  WorkflowClientInterceptor,
  WorkflowExecutionDescription,
} from "@temporalio/client";
import { Client, Connection, WorkflowNotFoundError } from "@temporalio/client";
import { OpenTelemetryWorkflowClientInterceptor } from "@temporalio/interceptors-opentelemetry";
import fs from "fs-extra";

type TemporalNamespaces = "agent" | "connectors" | "front" | "relocation";
export const temporalWorkspaceToEnvVar: Record<TemporalNamespaces, string> = {
  agent: "TEMPORAL_AGENT_NAMESPACE",
  connectors: "TEMPORAL_CONNECTORS_NAMESPACE",
  front: "TEMPORAL_NAMESPACE",
  relocation: "TEMPORAL_RELOCATION_NAMESPACE",
};

export const TEMPORAL_MAXED_CACHED_WORKFLOWS = 50;

// This is a singleton connection to the Temporal server.
const TEMPORAL_CLIENTS: Partial<Record<TemporalNamespaces, Client>> = {};

export async function getTemporalClientForNamespace(
  namespace: TemporalNamespaces,
  workflows: WorkflowClientInterceptor[] = []
) {
  const cachedClient = TEMPORAL_CLIENTS[namespace];
  if (cachedClient) {
    return cachedClient;
  }
  const envVarForTemporalNamespace = temporalWorkspaceToEnvVar[namespace];
  const connectionOptions = await getConnectionOptions(
    envVarForTemporalNamespace
  );
  const connection = await Connection.connect(connectionOptions);
  const client = new Client({
    connection,
    namespace: process.env[envVarForTemporalNamespace],
    interceptors: {
      workflow: workflows,
    },
  });
  TEMPORAL_CLIENTS[namespace] = client;

  return client;
}

export async function getConnectionOptions(
  envVarForTemporalNamespace: string = temporalWorkspaceToEnvVar["front"]
): Promise<
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

  const { TEMPORAL_CERT_PATH, TEMPORAL_CERT_KEY_PATH } = process.env;
  const TEMPORAL_NAMESPACE = process.env[envVarForTemporalNamespace];
  if (!TEMPORAL_CERT_PATH || !TEMPORAL_CERT_KEY_PATH || !TEMPORAL_NAMESPACE) {
    throw new Error(
      `TEMPORAL_CERT_PATH, TEMPORAL_CERT_KEY_PATH and ${envVarForTemporalNamespace} are required ` +
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

export async function getTemporalClientForAgentNamespace() {
  return getTemporalClientForNamespace("agent", [
    new OpenTelemetryWorkflowClientInterceptor(),
  ]);
}

export async function getTemporalClientForFrontNamespace() {
  return getTemporalClientForNamespace("front", [
    new OpenTelemetryWorkflowClientInterceptor(),
  ]);
}

export async function getTemporalClientForConnectorsNamespace() {
  return getTemporalClientForNamespace("connectors");
}

export async function describeTemporalWorkflow(
  temporalClient: Client,
  {
    workflowId,
  }: {
    workflowId: string;
  }
): Promise<WorkflowExecutionDescription | null> {
  try {
    return await temporalClient.workflow.getHandle(workflowId).describe();
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) {
      return null;
    }

    throw err;
  }
}

/**
 * Checks if there are any running upsert workflows for a specific datasource.
 * Returns the count of running workflows.
 */
export async function checkRunningUpsertWorkflows({
  workspaceId,
  dataSourceId,
}: {
  workspaceId: string;
  dataSourceId: string;
}): Promise<number> {
  const client = await getTemporalClientForFrontNamespace();

  // Query for all Active upsert workflows for this datasource
  const query = `WorkflowId STARTS_WITH "upsert-queue-document-${workspaceId}-${dataSourceId}-" AND ExecutionStatus="Running"`;
  const workflows = client.workflow.list({ query });

  let count = 0;
  for await (const _workflow of workflows) {
    count++;
  }

  return count;
}

// This function allows to heartbeat back to the temporal workflow, but also
// awaits a temporal sleep(0), which allows to throw an exception if the activity should be cancelled.
export async function heartbeat() {
  try {
    Context.current();
  } catch (_error) {
    // If we're not in a temporal context, Context.current() will throw
    // In this case, we just return without doing anything
    // This allows the function to be called safely outside of temporal activities
    return;
  }
  Context.current().heartbeat();
  await Context.current().sleep(0);
}
