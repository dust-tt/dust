import { mintDownscopedGcsToken } from "@app/lib/api/sandbox/gcs/token";
import fileStorageConfig from "@app/lib/file_storage/config";
import { describe, expect, it } from "vitest";

/**
 * Manual integration test for GCS downscoped token CAB rules.
 *
 * Requires GCP credentials (SERVICE_ACCOUNT env var or Workload Identity) and a real bucket with
 * existing objects under the test prefix.
 *
 * Run manually:
 *   MANUAL_GCS_TEST=1 npm test lib/api/sandbox/gcs/token.test.ts
 *
 * Skipped by default in CI / regular test runs.
 */

// Must be a prefix that contains at least one object in the bucket.
const PREFIX = "w/ncfXXrse2l/conversations/AtDChPZB16/files";
const GCS_API = "https://storage.googleapis.com/storage/v1";

const runManual = process.env.MANUAL_GCS_TEST === "1";

describe.skipIf(!runManual)("GCS downscoped token CAB", () => {
  let accessToken: string;
  let bucket: string;

  it("mints a downscoped token", async () => {
    bucket = fileStorageConfig.getGcsPrivateUploadsBucket();
    const result = await mintDownscopedGcsToken({ bucket, prefix: PREFIX });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.expiresInSeconds).toBeGreaterThan(0);
    accessToken = result.value.accessToken;
  });

  // -- Allowed operations --

  it("allows buckets.get (needed for gcsfuse mount)", async () => {
    const res = await fetch(`${GCS_API}/b/${bucket}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
  });

  it("allows objects.list on the conversation prefix", async () => {
    const res = await fetch(
      `${GCS_API}/b/${bucket}/o?prefix=${encodeURIComponent(PREFIX + "/")}&maxResults=5`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect((data.items ?? []).length).toBeGreaterThan(0);
  });

  it("allows write + read + delete on the conversation prefix", async () => {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const objectName = `${PREFIX}/cab-test-${Date.now()}.txt`;
    const content = `CAB test at ${new Date().toISOString()}`;

    // Write.
    const writeRes = await fetch(
      `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "text/plain" },
        body: content,
      }
    );
    expect(writeRes.status).toBe(200);

    // Read back.
    const readRes = await fetch(
      `${GCS_API}/b/${bucket}/o/${encodeURIComponent(objectName)}?alt=media`,
      { headers }
    );
    expect(readRes.status).toBe(200);
    expect(await readRes.text()).toBe(content);

    // Delete (cleanup).
    const delRes = await fetch(
      `${GCS_API}/b/${bucket}/o/${encodeURIComponent(objectName)}`,
      { method: "DELETE", headers }
    );
    expect(delRes.status).toBe(204);
  });

  // -- Blocked operations --

  it("blocks objects.list without a prefix", async () => {
    const res = await fetch(`${GCS_API}/b/${bucket}/o?maxResults=5`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(403);
  });

  it("blocks objects.list on a different prefix", async () => {
    const res = await fetch(`${GCS_API}/b/${bucket}/o?prefix=w/&maxResults=5`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(403);
  });

  it("blocks objects.get on a different prefix", async () => {
    const res = await fetch(
      `${GCS_API}/b/${bucket}/o/${encodeURIComponent("w/OTHER/conversations/fake/files/secret.txt")}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    expect(res.ok).toBe(false);
  });

  it("blocks objects.create on a different prefix", async () => {
    const res = await fetch(
      `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent("w/OTHER/conversations/fake/files/hacked.txt")}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "text/plain",
        },
        body: "should not be written",
      }
    );
    expect(res.ok).toBe(false);
  });
});
