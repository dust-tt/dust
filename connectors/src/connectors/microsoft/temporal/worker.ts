import { getTemporalWorkerConnection } from "@connectors/lib/temporal";

export async function runMicrosoftWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  console.log("Connected to Temporal", connection, namespace);
}
