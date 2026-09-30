import appConfig from "@app/lib/api/config";
import { getBucketInstance } from "@app/lib/file_storage";
import fileStorageConfig from "@app/lib/file_storage/config";
import config from "@app/temporal/relocation/activities/config";
import {
  isFileStorageTransferComplete,
  startTransferCoreTableFiles,
  startTransferFrontEgressPolicyFiles,
} from "@app/temporal/relocation/activities/source_region/front/file_storage";
import { StorageTransferService } from "@app/temporal/relocation/lib/file_storage/transfer";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { Err, Ok } from "@app/types/shared/result";
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
    vi.spyOn(fileStorageConfig, "getDustTablesBucket").mockReturnValue(
      "source-tables"
    );
    vi.spyOn(config, "getGcsTransferProjectId").mockReturnValue(
      "transfer-project"
    );
    vi.spyOn(
      StorageTransferService.prototype,
      "startPooledTransfer"
    ).mockResolvedValue(new Ok("transferOperations/test"));
    vi.spyOn(
      StorageTransferService.prototype,
      "isTransferJobDone"
    ).mockResolvedValue(new Ok(false));
    vi.spyOn(
      StorageTransferService.prototype,
      "isTransferOperationDone"
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
    expect(bucket.getFiles).toHaveBeenCalledExactlyOnceWith({
      prefix: sourcePath,
      maxResults: 1,
    });
    expect(
      StorageTransferService.prototype.startPooledTransfer
    ).not.toHaveBeenCalled();
    await expect(isFileStorageTransferComplete({ jobName })).resolves.toBe(
      true
    );
    expect(
      StorageTransferService.prototype.isTransferJobDone
    ).not.toHaveBeenCalled();
    expect(
      StorageTransferService.prototype.isTransferOperationDone
    ).not.toHaveBeenCalled();
  });

  it("starts and polls an operation when the source prefix contains a file", async () => {
    fileStorageMock.setFilesByPrefix((prefix) =>
      prefix === sourcePath
        ? [{ name: `${sourcePath}table.json`, metadata: {} }]
        : []
    );

    const jobName = await startTransferCoreTableFiles(params);

    expect(jobName).toBe("transferOperations/test");
    expect(
      StorageTransferService.prototype.startPooledTransfer
    ).toHaveBeenCalledExactlyOnceWith({
      destBucket: params.destBucket,
      destPath: "project-destination-project/destination-data-source/",
      destCell: params.destCell,
      sourceBucket: "source-tables",
      sourcePath,
      transferProjectId: "transfer-project",
      sourceCell: params.sourceCell,
      workspaceId: params.workspaceId,
    });
    await expect(isFileStorageTransferComplete({ jobName })).resolves.toBe(
      false
    );
    expect(
      StorageTransferService.prototype.isTransferOperationDone
    ).toHaveBeenCalledExactlyOnceWith(jobName);
    expect(
      StorageTransferService.prototype.isTransferJobDone
    ).not.toHaveBeenCalled();
  });

  it("still polls job IDs recorded by existing workflows", async () => {
    await expect(
      isFileStorageTransferComplete({ jobName: "transferJobs/legacy" })
    ).resolves.toBe(false);
    expect(
      StorageTransferService.prototype.isTransferJobDone
    ).toHaveBeenCalledExactlyOnceWith({
      jobName: "transferJobs/legacy",
      transferProjectId: "transfer-project",
    });
    expect(
      StorageTransferService.prototype.isTransferOperationDone
    ).not.toHaveBeenCalled();
  });

  it("fails when listing fails instead of treating the prefix as empty", async () => {
    const bucket = getBucketInstance("source-tables");
    vi.mocked(getBucketInstance).mockReturnValueOnce(bucket);
    const error = new Error("GCS permission denied");
    vi.spyOn(bucket, "getFiles").mockRejectedValueOnce(error);

    await expect(startTransferCoreTableFiles(params)).rejects.toBe(error);
    expect(
      StorageTransferService.prototype.startPooledTransfer
    ).not.toHaveBeenCalled();
  });

  it("keeps transfer start failures retryable for nonempty prefixes", async () => {
    fileStorageMock.setFilesByPrefix(() => [
      { name: `${sourcePath}table.json`, metadata: {} },
    ]);
    const error = new Error("STS quota exceeded");
    vi.mocked(
      StorageTransferService.prototype.startPooledTransfer
    ).mockResolvedValueOnce(new Err(error));

    await expect(startTransferCoreTableFiles(params)).rejects.toBe(error);
  });
});

describe("egress policy file transfers", () => {
  const egressParams = {
    destBucket: "destination-egress-policies",
    destCell: "cell-00001",
    sourceCell: "cell-00000",
    workspaceId: "test-workspace",
  } satisfies Parameters<typeof startTransferFrontEgressPolicyFiles>[0];

  const egressPrefix = "w/test-workspace/";

  beforeEach(() => {
    vi.spyOn(appConfig, "getEgressPolicyBucket").mockReturnValue(
      "source-egress-policies"
    );
    vi.spyOn(config, "getGcsTransferProjectId").mockReturnValue(
      "transfer-project"
    );
    vi.spyOn(
      StorageTransferService.prototype,
      "createTransferJob"
    ).mockResolvedValue(new Ok("transferJobs/egress-test"));
    vi.spyOn(
      StorageTransferService.prototype,
      "isTransferJobDone"
    ).mockResolvedValue(new Ok(false));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("completes empty prefixes without creating an STS job", async () => {
    const bucket = getBucketInstance("source-egress-policies");
    vi.mocked(getBucketInstance).mockReturnValueOnce(bucket);

    const jobName = await startTransferFrontEgressPolicyFiles(egressParams);

    expect(jobName).toBeNull();
    expect(bucket.getFiles).toHaveBeenCalledExactlyOnceWith({
      prefix: egressPrefix,
      maxResults: 1,
    });
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

  it("copies the workspace prefix verbatim when it contains a policy file", async () => {
    fileStorageMock.setFilesByPrefix((prefix) =>
      prefix === egressPrefix
        ? [{ name: `${egressPrefix}sandbox-egress-policy.json`, metadata: {} }]
        : []
    );

    const jobName = await startTransferFrontEgressPolicyFiles(egressParams);

    expect(jobName).toBe("transferJobs/egress-test");
    expect(
      StorageTransferService.prototype.createTransferJob
    ).toHaveBeenCalledExactlyOnceWith({
      destBucket: egressParams.destBucket,
      destPath: egressPrefix,
      destCell: egressParams.destCell,
      sourceBucket: "source-egress-policies",
      sourcePath: egressPrefix,
      transferProjectId: "transfer-project",
      sourceCell: egressParams.sourceCell,
      workspaceId: egressParams.workspaceId,
    });
    await expect(isFileStorageTransferComplete({ jobName })).resolves.toBe(
      false
    );
    expect(
      StorageTransferService.prototype.isTransferJobDone
    ).toHaveBeenCalledExactlyOnceWith({
      jobName,
      transferProjectId: "transfer-project",
    });
  });

  it("fails when listing fails instead of treating the prefix as empty", async () => {
    const bucket = getBucketInstance("source-egress-policies");
    vi.mocked(getBucketInstance).mockReturnValueOnce(bucket);
    const error = new Error("GCS permission denied");
    vi.spyOn(bucket, "getFiles").mockRejectedValueOnce(error);

    await expect(
      startTransferFrontEgressPolicyFiles(egressParams)
    ).rejects.toBe(error);
    expect(
      StorageTransferService.prototype.createTransferJob
    ).not.toHaveBeenCalled();
  });

  it("keeps transfer job creation failures retryable for nonempty prefixes", async () => {
    fileStorageMock.setFilesByPrefix(() => [
      { name: `${egressPrefix}sandboxes/con_1.json`, metadata: {} },
    ]);
    const error = new Error("STS quota exceeded");
    vi.mocked(
      StorageTransferService.prototype.createTransferJob
    ).mockResolvedValueOnce(new Err(error));

    await expect(
      startTransferFrontEgressPolicyFiles(egressParams)
    ).rejects.toBe(error);
  });
});
