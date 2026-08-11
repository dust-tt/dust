import { DustFileSystem } from "@app/lib/api/file_system";
import type { DustFileSystemError } from "@app/lib/api/file_system/types";
import {
  deleteCanonicalFile,
  moveCanonicalFile,
  reconcileCanonicalFileResourcesAfterMove,
} from "@app/lib/api/files/file_system_ops";
import { normalizeAndValidateMountRelativeFilePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { SandboxFileSystemMutationResource } from "@app/lib/resources/sandbox_file_system_mutation_resource";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

const MountSchema = z
  .object({
    kind: z.enum(["conversation", "pod"]),
    id: z.string().min(1).max(128),
  })
  .strict();

const MutationBaseSchema = z.object({
  idempotencyKey: z.string().uuid(),
  mount: MountSchema,
  path: z.string().min(1).max(4096),
});

export const SandboxFileSystemMutationRequestSchema = z.discriminatedUnion(
  "operation",
  [
    MutationBaseSchema.extend({ operation: z.literal("unlink") }).strict(),
    MutationBaseSchema.extend({
      operation: z.literal("rename"),
      // Optional so sandboxes running the previous single-mount helper remain
      // compatible during rollout. Omitted means the source mount.
      destinationMount: MountSchema.optional(),
      destinationPath: z.string().min(1).max(4096),
    }).strict(),
  ]
);

export type SandboxFileSystemMutationRequest = z.infer<
  typeof SandboxFileSystemMutationRequestSchema
>;

export class SandboxFileSystemMutationError extends Error {
  constructor(
    readonly code: "in_progress" | "invalid_request" | "operation_failed",
    message: string
  ) {
    super(message);
    this.name = "SandboxFileSystemMutationError";
  }
}

function scopedPath(
  mount: SandboxFileSystemMutationRequest["mount"],
  relativePath: string
): Result<string, SandboxFileSystemMutationError> {
  const pathResult = normalizeAndValidateMountRelativeFilePath(relativePath);
  if (pathResult.isErr()) {
    return new Err(
      new SandboxFileSystemMutationError(
        "invalid_request",
        pathResult.error.message
      )
    );
  }

  return new Ok(`${mount.kind}-${mount.id}/${pathResult.value}`);
}

function isIdempotentSuccess(error: DustFileSystemError): boolean {
  return error.code === "not_found";
}

async function pathExists(
  dustFs: DustFileSystem,
  path: string
): Promise<Result<boolean, DustFileSystemError>> {
  const fileStat = await dustFs.stat(path);
  if (fileStat.isErr()) {
    return new Err(fileStat.error);
  }
  if (fileStat.value !== null) {
    return new Ok(true);
  }

  const directoryStat = await dustFs.stat(`${path}/`);
  if (directoryStat.isErr()) {
    return directoryStat;
  }
  return new Ok(directoryStat.value !== null);
}

async function executeMutation(
  auth: Authenticator,
  request: SandboxFileSystemMutationRequest
): Promise<Result<void, Error>> {
  const sourcePathResult = scopedPath(request.mount, request.path);
  if (sourcePathResult.isErr()) {
    return sourcePathResult;
  }
  const sourcePath = sourcePathResult.value;
  const fileSystemContextPath =
    request.operation === "rename" &&
    request.mount.kind === "pod" &&
    request.destinationMount?.kind === "conversation"
      ? scopedPath(request.destinationMount, request.destinationPath)
      : new Ok(sourcePath);
  if (fileSystemContextPath.isErr()) {
    return fileSystemContextPath;
  }

  const fsResult = await DustFileSystem.fromScopedPath(
    auth,
    fileSystemContextPath.value
  );
  if (fsResult.isErr()) {
    return fsResult;
  }
  const dustFs = fsResult.value;

  switch (request.operation) {
    case "unlink": {
      const result = await deleteCanonicalFile(auth, dustFs, sourcePath);
      if (result.isErr() && !isIdempotentSuccess(result.error)) {
        return result;
      }
      return new Ok(undefined);
    }

    case "rename": {
      const destinationMount = request.destinationMount ?? request.mount;
      const destinationPathResult = scopedPath(
        destinationMount,
        request.destinationPath
      );
      if (destinationPathResult.isErr()) {
        return destinationPathResult;
      }
      const destinationPath = destinationPathResult.value;

      const [sourceExists, destinationExists] = await Promise.all([
        pathExists(dustFs, sourcePath),
        pathExists(dustFs, destinationPath),
      ]);
      if (sourceExists.isErr()) {
        return sourceExists;
      }
      if (destinationExists.isErr()) {
        return destinationExists;
      }

      // Recovery after Front moved the GCS object but crashed before updating
      // the FileResource or marking the mutation complete.
      if (!sourceExists.value && destinationExists.value) {
        await reconcileCanonicalFileResourcesAfterMove(
          auth,
          dustFs,
          sourcePath,
          destinationPath
        );
        return new Ok(undefined);
      }

      const result = await moveCanonicalFile(
        auth,
        dustFs,
        sourcePath,
        destinationPath,
        { overwrite: true }
      );
      if (result.isErr()) {
        return result;
      }
      return new Ok(undefined);
    }

    default:
      return assertNever(request);
  }
}

export async function applySandboxFileSystemMutation(
  auth: Authenticator,
  sandbox: SandboxResource,
  request: SandboxFileSystemMutationRequest
): Promise<Result<void, SandboxFileSystemMutationError>> {
  const claimResult = await SandboxFileSystemMutationResource.claim(
    auth,
    sandbox,
    {
      idempotencyKey: request.idempotencyKey,
      request,
    }
  );
  if (claimResult.isErr()) {
    return new Err(
      new SandboxFileSystemMutationError(
        "invalid_request",
        claimResult.error.message
      )
    );
  }

  const { mutation, shouldExecute } = claimResult.value;
  if (!shouldExecute) {
    if (mutation.status === "completed") {
      return new Ok(undefined);
    }
    return new Err(
      new SandboxFileSystemMutationError(
        "in_progress",
        "The filesystem mutation is already in progress."
      )
    );
  }

  try {
    const executionResult = await executeMutation(auth, request);
    if (executionResult.isErr()) {
      await mutation.markFailed(auth, executionResult.error);
      return new Err(
        new SandboxFileSystemMutationError(
          "operation_failed",
          executionResult.error.message
        )
      );
    }

    await mutation.markCompleted(auth);
    return new Ok(undefined);
  } catch (error) {
    const normalized = normalizeError(error);
    await mutation.markFailed(auth, normalized);
    return new Err(
      new SandboxFileSystemMutationError("operation_failed", normalized.message)
    );
  }
}
