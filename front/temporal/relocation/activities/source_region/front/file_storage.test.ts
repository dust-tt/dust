import { getBucketInstance } from "@app/lib/file_storage";
import fileStorageConfig from "@app/lib/file_storage/config";
import config from "@app/temporal/relocation/activities/config";
import {
  isFileStorageTransferComplete,
  startTransferCoreTableFiles,
} from "@app/temporal/relocation/activities/source_region/front/file_storage";
import { copyCoreTableFiles } from "@app/temporal/relocation/lib/file_storage/copy_core_tables";
import { StorageTransferService } from "@app/temporal/relocation/lib/file_storage/transfer";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@temporalio/activity", () => ({
  Context: {
    current: () => ({ cancellationSignal: new AbortController().signal }),
  },
}));

vi.mock("@app/temporal/relocation/lib/file_storage/copy_core_tables", () => ({
  copyCoreTableFiles: vi.fn(),
}));

const params = {
  dataSourceCoreIds: {
    id: 1,
    dustAPIProjectId: "source-project",
    dustAPIDataSourceId: "source-data-source",
  },
  destBucket: "destination-tables",
  destIds: {
    dustAPIProjectId: "destination-project",
    dustAPIDataSourceId: "destination-data-source",
  },
  destCell: "cell-00001",
  sourceCell: "cell-00000",
  workspaceId: "test-workspace",
} satisfies Parameters<typeof startTransferCoreTableFiles>[0];

const sourcePath = "project-source-project/source-data-source/";

describe("core table file transfers", () => {
  beforeEach(() => {
    vi.mocked(copyCoreTableFiles).mockReset();
    vi.mocked(copyCoreTableFiles).mockResolvedValue({
      copied: 1,
      alreadyCopied: 0,
    });
    vi.spyOn(fileStorageConfig, "getDustTablesBucket").mockReturnValue(
      "source-tables"
    );
    vi.spyOn(config, "getGcsTransferProjectId").mockReturnValue(
      "transfer-project"
    );
    vi.spyOn(
      StorageTransferService.prototype,
      "createTransferJob"
    ).mockResolvedValue(new Ok("transferJobs/test"));
    vi.spyOn(
      StorageTransferService.prototype,
      "isTransferJobDone"
    ).mockResolvedValue(new Ok(false));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    { environment: "production", useServiceAccount: false },
    { environment: "development", useServiceAccount: true },
  ])("selects the expected storage credentials in $environment", async ({
    environment,
    useServiceAccount,
  }) => {
    vi.stubEnv("NODE_ENV", environment);
    vi.stubEnv("IS_DEVELOPMENT", "false");

    await startTransferCoreTableFiles(params);

    expect(getBucketInstance).toHaveBeenLastCalledWith("source-tables", {
      useServiceAccount,
    });
  });

  it("completes empty prefixes without creating or polling an STS job", async () => {
    const bucket = getBucketInstance("source-tables");
    vi.mocked(getBucketInstance).mockReturnValueOnce(bucket);

    const jobName = await startTransferCoreTableFiles(params);

    expect(jobName).toBeNull();
    expect(bucket.getAllFilesByPrefix).toHaveBeenCalledExactlyOnceWith({
      prefix: sourcePath,
    });
    expect(copyCoreTableFiles).not.toHaveBeenCalled();
    expect(
      StorageTransferService.prototype.createTransferJob
    ).not.toHaveBeenCalled();
    await expect(isFileStorageTransferComplete({ jobName })).resolves.toBe(
      true
    );
    expect(
      StorageTransferService.prototype.isTransferJobDone
    ).not.toHaveBeenCalled();
  });

  it("copies and verifies nonempty prefixes before returning null without STS", async () => {
    fileStorageMock.setFilesByPrefix(() => [
      {
        name: `${sourcePath}table.csv`,
        metadata: { generation: "1", size: "42", crc32c: "checksum" },
      },
    ]);
    expect(await startTransferCoreTableFiles(params)).toBeNull();
    expect(copyCoreTableFiles).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        sourcePrefix: sourcePath,
        destinationPrefix:
          "project-destination-project/destination-data-source/",
        files: expect.arrayContaining([
          expect.objectContaining({ name: `${sourcePath}table.csv` }),
        ]),
      })
    );
    expect(getBucketInstance).toHaveBeenLastCalledWith("destination-tables", {
      useServiceAccount: false,
    });
    expect(
      StorageTransferService.prototype.createTransferJob
    ).not.toHaveBeenCalled();
  });

  it("keeps polling STS job names recorded before this deployment", async () => {
    await expect(
      isFileStorageTransferComplete({ jobName: "transferJobs/existing" })
    ).resolves.toBe(false);
    expect(
      StorageTransferService.prototype.isTransferJobDone
    ).toHaveBeenCalledExactlyOnceWith({
      jobName: "transferJobs/existing",
      transferProjectId: "transfer-project",
    });
  });

  it("fails when listing fails instead of treating the prefix as empty", async () => {
    const bucket = getBucketInstance("source-tables");
    vi.mocked(getBucketInstance).mockReturnValueOnce(bucket);
    const error = new Error("GCS permission denied");
    vi.spyOn(bucket, "getAllFilesByPrefix").mockRejectedValueOnce(error);

    await expect(startTransferCoreTableFiles(params)).rejects.toBe(error);
    expect(
      StorageTransferService.prototype.createTransferJob
    ).not.toHaveBeenCalled();
  });

  it("propagates copy or verification failures instead of marking completion", async () => {
    fileStorageMock.setFilesByPrefix(() => [
      { name: `${sourcePath}table.csv`, metadata: {} },
    ]);
    const error = new Error("Copy failed");
    vi.mocked(copyCoreTableFiles).mockRejectedValueOnce(error);
    await expect(startTransferCoreTableFiles(params)).rejects.toBe(error);
    expect(
      StorageTransferService.prototype.createTransferJob
    ).not.toHaveBeenCalled();
  });
});
