import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { protos } from "@google-cloud/storage-transfer";
import { StorageTransferServiceClient } from "@google-cloud/storage-transfer";
import type { google } from "@google-cloud/storage-transfer/build/protos/protos";

import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";

interface TransferConfig {
  destBucket: string;
  destPath: string;
  destRegion: RegionType;
  sourceBucket: string;
  sourcePath: string;
  sourceProjectId: string;
  sourceRegion: RegionType;
  workspaceId: string;
}

export class StorageTransferService {
  private transferClient: StorageTransferServiceClient;

  constructor() {
    const serviceAccountPath = config.getServiceAccount();

    this.transferClient = new StorageTransferServiceClient({
      keyFilename: serviceAccountPath,
    });
  }

  async createTransferJob({
    destBucket,
    destPath,
    destRegion,
    sourceBucket,
    sourcePath,
    sourceProjectId,
    sourceRegion,
    workspaceId,
  }: TransferConfig): Promise<Result<string, Error>> {
    const transferJob: google.storagetransfer.v1.ITransferJob = {
      description: `Migrate workspace ${workspaceId} from region ${sourceRegion} to ${destRegion}`,
      projectId: sourceProjectId,
      transferSpec: {
        gcsDataSource: {
          bucketName: sourceBucket,
          path: sourcePath,
        },
        gcsDataSink: {
          bucketName: destBucket,
          path: destPath,
        },
        transferOptions: {
          overwriteObjectsAlreadyExistingInSink: false,
          overwriteWhen: "DIFFERENT",
        },
      },
      // Schedule the transfer to start immediately.
      schedule: {
        scheduleStartDate: {
          year: new Date().getUTCFullYear(),
          month: new Date().getUTCMonth() + 1,
          day: new Date().getUTCDate(),
        },
        scheduleEndDate: {
          year: new Date().getUTCFullYear(),
          month: new Date().getUTCMonth() + 1,
          day: new Date().getUTCDate(),
        },
      },
      status: "ENABLED",
    };

    try {
      // Create and start transfer.
      const [job] = await this.transferClient.createTransferJob({
        transferJob,
      });

      if (!job.name) {
        return new Err(new Error("Failed to create transfer"));
      }

      return new Ok(job.name);
    } catch (error) {
      return new Err(new Error(`Failed to create transfer: ${error}`));
    }
  }

  async isTransferJobDone({
    jobName,
    sourceProjectId,
  }: {
    jobName: string;
    sourceProjectId: string;
  }): Promise<Result<boolean, Error>> {
    try {
      const [transferJob] = await this.transferClient.getTransferJob({
        jobName,
        projectId: sourceProjectId,
      });

      const { latestOperationName } = transferJob;

      // If no operation exists yet, transfer hasn't started.
      if (!latestOperationName) {
        return new Ok(false);
      }

      const operationRequest: protos.google.longrunning.GetOperationRequest =
        new protos.google.longrunning.GetOperationRequest({
          name: latestOperationName,
        });

      // Fetch the latest operation details using the operation name.
      const [operation] =
        await this.transferClient.getOperation(operationRequest);

      if (operation.error) {
        return new Err(new Error(`Transfer failed: ${operation.error}`));
      }

      // Transfer is done when operation is done and there are no errors
      return new Ok(operation.done && !operation.error);
    } catch (error) {
      return new Err(new Error(`Failed to check transfer status: ${error}`));
    }
  }
}
