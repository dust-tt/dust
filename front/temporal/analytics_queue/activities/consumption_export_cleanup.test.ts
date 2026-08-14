import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { cleanupConsumptionExportsActivity } from "@app/temporal/analytics_queue/activities/consumption_export_cleanup";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { describe, expect, it } from "vitest";

const DAY_MS = 24 * 60 * 60 * 1000;

const FRESH_PATH = "consumption_exports/w/w1/fresh.zip";
const STALE_PATH = "consumption_exports/w/w2/stale.zip";
const NO_TIMESTAMP_PATH = "consumption_exports/w/w3/no-timestamp.zip";

describe("cleanupConsumptionExportsActivity", () => {
  it("deletes only files older than the retention window", async () => {
    const bucket = getPrivateUploadBucket();
    await bucket
      .file(FRESH_PATH)
      .save(Buffer.from("fresh"), { contentType: "application/zip" });
    await bucket
      .file(STALE_PATH)
      .save(Buffer.from("stale"), { contentType: "application/zip" });
    await bucket
      .file(NO_TIMESTAMP_PATH)
      .save(Buffer.from("unknown-age"), { contentType: "application/zip" });

    const now = Date.now();
    fileStorageMock.setFilesByPrefix((prefix) => {
      if (prefix !== "consumption_exports/") {
        return null;
      }
      return [
        {
          name: FRESH_PATH,
          metadata: { timeCreated: new Date(now - 1 * DAY_MS).toISOString() },
        },
        {
          name: STALE_PATH,
          metadata: { timeCreated: new Date(now - 16 * DAY_MS).toISOString() },
        },
        {
          name: NO_TIMESTAMP_PATH,
          metadata: {},
        },
      ];
    });

    await cleanupConsumptionExportsActivity();

    expect(fileStorageMock.getObject(FRESH_PATH)).toBeDefined();
    expect(fileStorageMock.getObject(NO_TIMESTAMP_PATH)).toBeDefined();
    expect(fileStorageMock.getObject(STALE_PATH)).toBeUndefined();
  });

  it("does nothing when there are no exports", async () => {
    fileStorageMock.setFilesByPrefix(() => []);

    await expect(cleanupConsumptionExportsActivity()).resolves.toBeUndefined();
  });
});
