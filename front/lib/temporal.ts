import type { ConnectionOptions } from "@temporalio/client";
import { Client, Connection } from "@temporalio/client";
import { NativeConnection } from "@temporalio/worker";
import fs from "fs-extra";

// This is a singleton connection to the Temporal server.
let TEMPORAL_CLIENT: Client | undefined;

export async function getTemporalClient() {
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
