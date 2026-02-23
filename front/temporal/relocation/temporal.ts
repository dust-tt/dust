import {
  getConnectionOptions,
  getTemporalClientForNamespace,
  temporalWorkspaceToEnvVar,
} from "@app/lib/temporal";
import { NativeConnection } from "@temporalio/worker";

export async function getTemporalRelocationWorkerConnection(): Promise<{
  connection: NativeConnection;
  namespace: string | undefined;
}> {
  const connectionOptions = await getConnectionOptions(
    temporalWorkspaceToEnvVar["relocation"]
  );
  const connection = await NativeConnection.connect(connectionOptions);
  return { connection, namespace: process.env.TEMPORAL_RELOCATION_NAMESPACE };
}

export async function getTemporalRelocationClient() {
  return getTemporalClientForNamespace("relocation");
}
