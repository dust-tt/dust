import { archiveRecordingsSince } from "../src/archive.ts";
import { createClaapClient } from "../src/claap.ts";
import { createGoogleDrivePortFromAdc } from "../src/google_drive.ts";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function parseArgs(argv: string[]): { createdAfter: string } {
  const createdAfterFlag = argv.find((arg) => arg.startsWith("--created-after="));
  if (createdAfterFlag) {
    return { createdAfter: createdAfterFlag.slice("--created-after=".length) };
  }

  const daysFlag = argv.find((arg) => arg.startsWith("--days="));
  const days = daysFlag ? Number(daysFlag.slice("--days=".length)) : 2;
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("`--days` must be a positive number");
  }
  const createdAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return { createdAfter };
}

async function fetchVideo(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Video download failed: ${response.status}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  return {
    body,
    mimeType: response.headers.get("content-type") ?? "video/mp4",
    byteLength: body.byteLength,
  };
}

async function main() {
  const { createdAfter } = parseArgs(process.argv.slice(2));
  const claap = createClaapClient(requiredEnv("CLAAP_API_KEY"));
  const drive = createGoogleDrivePortFromAdc();
  const uploadVideo = process.env.UPLOAD_VIDEO === "true";

  const results = await archiveRecordingsSince({
    claap,
    drive,
    createdAfter,
    options: {
      rootFolderId: requiredEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID"),
      uploadVideo,
      maxVideoBytes: Number(process.env.MAX_VIDEO_BYTES ?? 209715200),
      fetchVideo: uploadVideo ? fetchVideo : undefined,
    },
  });

  const archived = results.filter((result) => result.status === "archived").length;
  const skipped = results.length - archived;
  console.log(
    JSON.stringify({ createdAfter, archived, skipped, results }, null, 2)
  );
}

await main();
