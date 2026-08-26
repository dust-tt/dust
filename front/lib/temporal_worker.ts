import {
  getConnectionOptions,
  temporalWorkspaceToEnvVar,
} from "@app/lib/temporal";
import { NativeConnection } from "@temporalio/worker";

export async function getTemporalAgentWorkerConnection(): Promise<{
  connection: NativeConnection;
  namespace: string | undefined;
}> {
  const connectionOptions = await getConnectionOptions(
    temporalWorkspaceToEnvVar["agent"]
  );
  const connection = await NativeConnection.connect(connectionOptions);
  return { connection, namespace: process.env.TEMPORAL_AGENT_NAMESPACE };
}

export async function getTemporalWorkerConnection(): Promise<{
  connection: NativeConnection;
  namespace: string | undefined;
}> {
  const connectionOptions = await getConnectionOptions();
  const connection = await NativeConnection.connect(connectionOptions);
  return { connection, namespace: process.env.TEMPORAL_NAMESPACE };
}
