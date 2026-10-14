import path from "node:path";

import { reconcileDatabaseOnReadySandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

/**
 * Reconcile every declared database using an already-staged source tree on a ready Frame
 * sandbox. Additive and retriable; callers own staging lifecycle.
 */
export async function reconcileFramePublicationDatabasesOnStagedSource(
  auth: Authenticator,
  {
    frame,
    sandbox,
    stagingDirectory,
    manifest,
  }: {
    frame: FileResource;
    sandbox: SandboxResource;
    stagingDirectory: string;
    manifest: FrameManifest;
  }
): Promise<Result<void, SandboxFunctionError>> {
  for (const database of manifest.databases) {
    const reconcileResult = await reconcileDatabaseOnReadySandbox(auth, {
      sandbox,
      database: database.name,
      schemaFileSandboxPath: path.posix.join(stagingDirectory, database.schema),
    });
    if (reconcileResult.isErr()) {
      return reconcileResult;
    }
    if (reconcileResult.value.statements.length > 0) {
      logger.info(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          frameId: frame.sId,
          database: database.name,
          created: reconcileResult.value.created,
          statements: reconcileResult.value.statements,
        },
        "Frame database reconciled: applied DDL"
      );
    }
  }

  return new Ok(undefined);
}
