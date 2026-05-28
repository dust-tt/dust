import {
  buildAccessBoundaryRules,
  mintDownscopedGcsToken,
} from "@app/lib/api/sandbox/gcs/token";
import fileStorageConfig from "@app/lib/file_storage/config";
import { beforeAll, describe, expect, it } from "vitest";

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
    const result = await mintDownscopedGcsToken({
      bucket,
      prefixes: [PREFIX],
    });
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

describe("buildAccessBoundaryRules", () => {
  beforeAll(() => {
    // buildAccessBoundaryRules reads GOOGLE_CLOUD_PROJECT_ID via config; ensure it's set.
    process.env.GOOGLE_CLOUD_PROJECT_ID ??= "test-project";
  });

  it("emits one bucket-get rule + 2 rules per prefix (single prefix)", () => {
    const rules = buildAccessBoundaryRules("bucket-x", [
      "w/ws1/conversations/c1/files",
    ]);
    expect(rules).toHaveLength(3);
  });

  it("scales linearly with the number of prefixes", () => {
    const rules = buildAccessBoundaryRules("bucket-x", [
      "w/ws1/conversations/c1/files",
      "w/ws1/pods/spc1/files",
    ]);
    expect(rules).toHaveLength(5);
  });

  it("keeps the unconditional bucket-get rule first", () => {
    const rules = buildAccessBoundaryRules("bucket-x", [
      "w/ws1/conversations/c1/files",
    ]);
    expect(rules[0].availablePermissions[0]).toMatch(/sandbox_storage_mount/);
    expect("availabilityCondition" in rules[0]).toBe(false);
  });

  it("references every prefix in list and resource.name conditions", () => {
    const prefixes = ["w/ws1/conversations/c1/files", "w/ws1/pods/spc1/files"];
    const rules = buildAccessBoundaryRules("bucket-x", prefixes);

    const listRules = rules.filter((r) =>
      r.availablePermissions[0].includes("legacyBucketReader")
    );
    const objectRules = rules.filter((r) =>
      r.availablePermissions[0].includes("objectUser")
    );
    expect(listRules).toHaveLength(2);
    expect(objectRules).toHaveLength(2);

    for (const prefix of prefixes) {
      expect(
        listRules.some(
          (r) =>
            "availabilityCondition" in r &&
            r.availabilityCondition.expression.includes(`'${prefix}/'`)
        )
      ).toBe(true);
      expect(
        objectRules.some(
          (r) =>
            "availabilityCondition" in r &&
            r.availabilityCondition.expression.includes(
              `projects/_/buckets/bucket-x/objects/${prefix}/`
            )
        )
      ).toBe(true);
    }
  });
});
