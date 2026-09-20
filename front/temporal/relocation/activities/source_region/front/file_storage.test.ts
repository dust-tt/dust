import { getBucketInstance } from "@app/lib/file_storage";
import fileStorageConfig from "@app/lib/file_storage/config";
import config from "@app/temporal/relocation/activities/config";
import {
  isFileStorageTransferComplete,
  startTransferCoreTableFiles,
} from "@app/temporal/relocation/activities/source_region/front/file_storage";
import { StorageTransferService } from "@app/temporal/relocation/lib/file_storage/transfer";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    fileStorageMock.setFileExists(() => false);
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
    expect(bucket.copyFile).not.toHaveBeenCalled();
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

  it("copies each object under the destination prefix, without STS", async () => {
    const source = getBucketInstance("source-tables");
    vi.mocked(getBucketInstance).mockReturnValueOnce(source);
    fileStorageMock.setFilesByPrefix((prefix) =>
      prefix === sourcePath
        ? [
            {
              name: `${sourcePath}nested/table.csv`,
              metadata: { generation: "42" },
            },
          ]
        : []
    );

    await expect(startTransferCoreTableFiles(params)).resolves.toBeNull();

    expect(source.copyFile).toHaveBeenCalledExactlyOnceWith(
      `${sourcePath}nested/table.csv`,
      "project-destination-project/destination-data-source/nested/table.csv",
      expect.anything(),
      { sourceGeneration: "42" }
    );
    expect(
      StorageTransferService.prototype.createTransferJob
    ).not.toHaveBeenCalled();
  });

  it("skips objects a previous attempt already copied", async () => {
    const source = getBucketInstance("source-tables");
    vi.mocked(getBucketInstance).mockReturnValueOnce(source);
    fileStorageMock.setFilesByPrefix(() => [
      { name: `${sourcePath}table.csv`, metadata: { generation: "42" } },
    ]);
    fileStorageMock.setFileExists(() => true);

    await expect(startTransferCoreTableFiles(params)).resolves.toBeNull();

    expect(source.copyFile).not.toHaveBeenCalled();
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

  it("fails the activity when a copy fails", async () => {
    fileStorageMock.setFilesByPrefix(() => [
      { name: `${sourcePath}table.csv`, metadata: { generation: "42" } },
    ]);
    fileStorageMock.setCopyFileFails(() => true);

    await expect(startTransferCoreTableFiles(params)).rejects.toThrow(
      "Simulated GCS copy failure"
    );
  });
});
