import { NativeConnection } from "@temporalio/worker";

import {
  getConnectionOptions,
  getTemporalClientForNamespace,
} from "@app/lib/temporal";

export async function getTemporalWorkerConnection(): Promise<{
  connection: NativeConnection;
  namespace: string | undefined;
}> {
  const connectionOptions = await getConnectionOptions("relocation");
  const connection = await NativeConnection.connect(connectionOptions);
  return { connection, namespace: process.env.TEMPORAL_RELOCATION_NAMESPACE };
}

export async function getTemporalRelocationClient() {
  return getTemporalClientForNamespace("relocation");
}
