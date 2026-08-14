import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import {
  describeTemporalWorkflow,
  getTemporalClientForFrontNamespace,
} from "@app/lib/temporal";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { buildConsumptionExportGcsPrefix } from "@app/temporal/analytics_queue/activities/consumption_export";
import type { LaunchConsumptionExportOutcome } from "@app/temporal/analytics_queue/client";
import { launchConsumptionExportWorkflow } from "@app/temporal/analytics_queue/client";
import { makeConsumptionExportWorkflowId } from "@app/temporal/analytics_queue/helpers";
import type { Result } from "@app/types/shared/result";

const DOWNLOAD_URL_EXPIRATION_DELAY_MS = 5 * 60 * 1000;

export type ConsumptionExportListItem = {
  name: string;
  createdAt: string;
  sizeBytes: number;
  downloadUrl: string;
};

export async function listConsumptionExports(
  auth: Authenticator
): Promise<ConsumptionExportListItem[]> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const bucket = getPrivateUploadBucket();

  const { files } = await bucket.getAllFilesByPrefix({
    prefix: buildConsumptionExportGcsPrefix(workspaceId),
  });

  const items = await concurrentExecutor(
    files,
    async (file) => {
      const downloadUrl = await bucket.getSignedUrl(file.name, {
        expirationDelayMs: DOWNLOAD_URL_EXPIRATION_DELAY_MS,
        promptSaveAs: `dust_consumption_lines_export_${workspaceId}.zip`,
      });

      return {
        name: file.name.split("/").pop() ?? file.name,
        createdAt: file.metadata.timeCreated ?? new Date(0).toISOString(),
        sizeBytes: Number(file.metadata.size ?? 0),
        downloadUrl,
      };
    },
    { concurrency: 8 }
  );

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function isConsumptionExportGenerating(
  auth: Authenticator
): Promise<boolean> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const client = await getTemporalClientForFrontNamespace();

  const description = await describeTemporalWorkflow(client, {
    workflowId: makeConsumptionExportWorkflowId({ workspaceId }),
  });

  return description?.status.name === "RUNNING";
}

export async function startConsumptionExport(
  auth: Authenticator,
  {
    period,
    filter,
  }: {
    period: ConsumptionPeriod;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<LaunchConsumptionExportOutcome, Error>> {
  return launchConsumptionExportWorkflow(auth, {
    period,
    filter: filter ?? {},
  });
}
