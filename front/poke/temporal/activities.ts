import { Storage } from "@google-cloud/storage";

const { DUST_DATA_SOURCES_BUCKET, SERVICE_ACCOUNT } = process.env;

export async function scrubDataSourceActivity({
  dustAPIProjectId,
}: {
  dustAPIProjectId: string;
}) {
  if (!SERVICE_ACCOUNT) {
    throw new Error("SERVICE_ACCOUNT is not set.");
  }
  if (!DUST_DATA_SOURCES_BUCKET) {
    throw new Error("DUST_DATA_SOURCES_BUCKET is not set.");
  }

  const storage = new Storage({ keyFilename: SERVICE_ACCOUNT });

  const [files] = await storage
    .bucket(DUST_DATA_SOURCES_BUCKET)
    .getFiles({ prefix: dustAPIProjectId });

  const chunkSize = 32;
  const chunks = [];
  for (let i = 0; i < files.length; i += chunkSize) {
    chunks.push(files.slice(i, i + chunkSize));
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) {
      continue;
    }
    await Promise.all(
      chunk.map((f) => {
        return (async () => {
          await f.delete();
        })();
      })
    );
  }
}
