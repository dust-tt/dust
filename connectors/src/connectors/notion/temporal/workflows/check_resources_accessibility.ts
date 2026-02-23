import type * as activities from "@connectors/connectors/notion/temporal/activities";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import type { ModelId } from "@connectors/types";
import { continueAsNew, proxyActivities } from "@temporalio/workflow";

const { checkResourceAccessibility, getResourcesFromGCSFile } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "3 minutes",
});

export type CheckResourcesAccessibilityInput = {
  connectorId: ModelId;
  gcsFilePaths: string[];
  concurrency?: number;
};

export async function checkResourcesAccessibilityWorkflow({
  connectorId,
  gcsFilePaths,
  concurrency = 4,
}: CheckResourcesAccessibilityInput): Promise<void> {
  // If no files to process, throw an error
  if (gcsFilePaths.length === 0) {
    throw new Error("No GCS files provided to process");
  }

  // Process the first file
  const currentFilePath = gcsFilePaths[0];
  if (!currentFilePath) {
    throw new Error("Invalid GCS file path: undefined");
  }
  const remainingFilePaths = gcsFilePaths.slice(1);

  // Get resources from the current GCS file
  const resources = await getResourcesFromGCSFile({
    gcsFilePath: currentFilePath,
  });

  // Process resources in this file with concurrency control
  await concurrentExecutor(
    resources,
    async (resource) => {
      await checkResourceAccessibility({
        connectorId,
        resourceId: resource.resourceId,
        resourceType: resource.resourceType,
      });
    },
    { concurrency }
  );

  // If there are more files to process, continue as new
  if (remainingFilePaths.length > 0) {
    await continueAsNew<typeof checkResourcesAccessibilityWorkflow>({
      connectorId,
      gcsFilePaths: remainingFilePaths,
      concurrency,
    });
  }
}
