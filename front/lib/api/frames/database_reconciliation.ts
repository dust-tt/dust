import path from "node:path";

import { withStagedFrameSource } from "@app/lib/api/frames/source_staging";
import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { reconcileDatabaseOnReadySandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import type { LockLeaseGuard, LockLeaseLostError } from "@app/lib/lock";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Reconcile every declared database against the Frame-owned SQLite state before publication
 * activation. The full captured source tree is staged so schema files can use relative imports.
 * Reconciliation is additive and retriable; a failure leaves the previous publication active.
 */
export async function reconcileFramePublicationDatabases(
  auth: Authenticator,
  {
    frame,
    manifest,
    sourceLease,
    sourceFiles,
  }: {
    frame: FileResource;
    manifest: FrameManifest;
    sourceLease: LockLeaseGuard;
    sourceFiles: ReadonlyArray<{ relativePath: string; content: Buffer }>;
  }
): Promise<Result<void, LockLeaseLostError | SandboxFunctionError>> {
  if (manifest.databases.length === 0) {
    return new Ok(undefined);
  }

  const ensureResult = await ensureFrameSandboxReady(auth, frame);
  if (ensureResult.isErr()) {
    return new Err(
      new SandboxFunctionError(
        "sandbox_unavailable",
        ensureResult.error.message
      )
    );
  }
  const { sandbox } = ensureResult.value;
  return withStagedFrameSource<void, LockLeaseLostError | SandboxFunctionError>(
    auth,
    { sandbox, sourceFiles },
    async (stagingDirectory) => {
      for (const database of manifest.databases) {
        const heldBeforeReconciliation = sourceLease.check();
        if (heldBeforeReconciliation.isErr()) {
          return heldBeforeReconciliation;
        }
        const reconcileResult = await reconcileDatabaseOnReadySandbox(auth, {
          sandbox,
          database: database.name,
          schemaFileSandboxPath: path.posix.join(
            stagingDirectory,
            database.schema
          ),
        });
        const heldAfterReconciliation = sourceLease.check();
        if (heldAfterReconciliation.isErr()) {
          return heldAfterReconciliation;
        }
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
  );
}
