/**
 * Mirror one Pod's Litestream replicas into one Frame's database state.
 *
 * The Pod and Frame sandboxes must not be writing state while this runs.
 *
 * Dry run:
 *   npx tsx scripts/copy_pod_databases_to_frame.ts \
 *     --workspaceId w_123 \
 *     --podId spc_123 \
 *     --frameId fil_123
 *
 * Execute:
 *   npx tsx scripts/copy_pod_databases_to_frame.ts \
 *     --workspaceId w_123 \
 *     --podId spc_123 \
 *     --frameId fil_123 \
 *     --execute
 */
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { getFrameDatabaseReplicasBasePath } from "@app/types/api/frame_storage";
import { POD_DATABASE_NAME_REGEX } from "@app/types/api/sandbox_functions";
import { getPodStateBasePath } from "@app/types/mount_path";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const DEFAULT_CONCURRENCY = 8;
const STORAGE_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const CopyPodDatabasesArgumentsSchema = z.object({
  concurrency: z.number().int().positive(),
  frameId: z.string().regex(STORAGE_ID_REGEX),
  podId: z.string().regex(STORAGE_ID_REGEX),
  workspaceId: z.string().regex(STORAGE_ID_REGEX),
});

type StorageObject = {
  name: string;
};

export type PodDatabaseStorage = {
  copyFile(sourcePath: string, destinationPath: string): Promise<void>;
  delete(
    filePath: string,
    options: { ignoreNotFound: boolean }
  ): Promise<unknown>;
  getAllFilesByPrefix(args: {
    prefix: string;
  }): Promise<{ files: StorageObject[] }>;
};

type DatabaseObjectCopy = {
  destinationPath: string;
  sourcePath: string;
};

type PodDatabaseCopyPlan = {
  copies: DatabaseObjectCopy[];
  destinationPrefix: string;
  sourcePrefix: string;
  staleDestinationPaths: string[];
};

type PodDatabaseCopySummary = {
  destinationPrefix: string;
  sourceObjectCount: number;
  sourcePrefix: string;
  staleDestinationObjectCount: number;
};

function isDatabaseReplicaRelativePath(relativePath: string): boolean {
  const slashIndex = relativePath.indexOf("/");
  if (slashIndex < 0) {
    return false;
  }

  const databaseDirectory = relativePath.slice(0, slashIndex);
  if (!databaseDirectory.endsWith(".db")) {
    return false;
  }

  const databaseName = databaseDirectory.slice(0, -".db".length);
  return POD_DATABASE_NAME_REGEX.test(databaseName);
}

export function planPodDatabaseCopy({
  destinationObjectPaths,
  frameId,
  podId,
  sourceObjectPaths,
  workspaceId,
}: {
  destinationObjectPaths: string[];
  frameId: string;
  podId: string;
  sourceObjectPaths: string[];
  workspaceId: string;
}): PodDatabaseCopyPlan {
  const sourcePrefix = getPodStateBasePath({ workspaceId, podId });
  const destinationPrefix = getFrameDatabaseReplicasBasePath({
    workspaceId,
    frameId,
  });

  if (sourceObjectPaths.length === 0) {
    throw new Error(`No Pod database replicas found under ${sourcePrefix}`);
  }

  const copies = [...sourceObjectPaths].sort().map((sourcePath) => {
    if (!sourcePath.startsWith(sourcePrefix)) {
      throw new Error(`Object is outside the Pod state prefix: ${sourcePath}`);
    }

    const relativePath = sourcePath.slice(sourcePrefix.length);
    if (!isDatabaseReplicaRelativePath(relativePath)) {
      throw new Error(
        `Unexpected object under Pod state prefix: ${sourcePath}`
      );
    }

    return {
      sourcePath,
      destinationPath: `${destinationPrefix}${relativePath}`,
    };
  });

  const copiedDestinationPaths = new Set(
    copies.map(({ destinationPath }) => destinationPath)
  );
  const staleDestinationPaths = [...destinationObjectPaths]
    .sort()
    .filter((destinationPath) => {
      if (!destinationPath.startsWith(destinationPrefix)) {
        throw new Error(
          `Object is outside the Frame database state prefix: ${destinationPath}`
        );
      }

      return !copiedDestinationPaths.has(destinationPath);
    });

  return {
    copies,
    destinationPrefix,
    sourcePrefix,
    staleDestinationPaths,
  };
}

export async function copyPodDatabasesToFrame({
  concurrency,
  execute,
  frameId,
  podId,
  storage,
  workspaceId,
}: {
  concurrency: number;
  execute: boolean;
  frameId: string;
  podId: string;
  storage: PodDatabaseStorage;
  workspaceId: string;
}): Promise<PodDatabaseCopySummary> {
  const sourcePrefix = getPodStateBasePath({ workspaceId, podId });
  const destinationPrefix = getFrameDatabaseReplicasBasePath({
    workspaceId,
    frameId,
  });
  const [sourceListing, destinationListing] = await Promise.all([
    storage.getAllFilesByPrefix({ prefix: sourcePrefix }),
    storage.getAllFilesByPrefix({ prefix: destinationPrefix }),
  ]);
  const plan = planPodDatabaseCopy({
    destinationObjectPaths: destinationListing.files.map(({ name }) => name),
    frameId,
    podId,
    sourceObjectPaths: sourceListing.files.map(({ name }) => name),
    workspaceId,
  });

  if (execute) {
    await concurrentExecutor(
      plan.copies,
      ({ destinationPath, sourcePath }) =>
        storage.copyFile(sourcePath, destinationPath),
      { concurrency }
    );

    // Only remove destination-only objects after every source copy succeeds.
    await concurrentExecutor(
      plan.staleDestinationPaths,
      (destinationPath) =>
        storage.delete(destinationPath, { ignoreNotFound: true }),
      { concurrency }
    );
  }

  return {
    destinationPrefix: plan.destinationPrefix,
    sourceObjectCount: plan.copies.length,
    sourcePrefix: plan.sourcePrefix,
    staleDestinationObjectCount: plan.staleDestinationPaths.length,
  };
}

function runScript(): void {
  makeScript(
    {
      workspaceId: {
        type: "string",
        demandOption: true,
        describe: "Workspace sId containing the Pod and Frame.",
      },
      podId: {
        type: "string",
        demandOption: true,
        describe: "Source Pod sId.",
      },
      frameId: {
        type: "string",
        demandOption: true,
        describe: "Destination Frame sId.",
      },
      concurrency: {
        type: "number",
        default: DEFAULT_CONCURRENCY,
        describe: "Maximum concurrent GCS copies and deletions.",
      },
    },
    async ({ concurrency, execute, frameId, podId, workspaceId }, logger) => {
      const parsedArguments = CopyPodDatabasesArgumentsSchema.safeParse({
        concurrency,
        frameId,
        podId,
        workspaceId,
      });
      if (!parsedArguments.success) {
        throw new Error(fromError(parsedArguments.error).toString());
      }

      const summary = await copyPodDatabasesToFrame({
        ...parsedArguments.data,
        execute,
        storage: getPrivateUploadBucket(),
      });

      logger.info(
        { ...summary, execute },
        execute
          ? "[copy_pod_databases_to_frame] Frame database state replaced"
          : "[copy_pod_databases_to_frame] [DRY RUN] Would replace Frame database state"
      );
    }
  );
}

if (process.argv[1]?.endsWith("copy_pod_databases_to_frame.ts")) {
  runScript();
}
