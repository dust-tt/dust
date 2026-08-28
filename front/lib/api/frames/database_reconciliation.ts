import { randomUUID } from "node:crypto";
import path from "node:path";

import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import { reconcileDatabaseOnReadySandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { FrameManifest } from "@app/types/api/frame_manifest";
import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const FRAME_DATABASE_STAGING_ROOT = "/tmp/dust-frame-database-schemas";
const FRAME_DATABASE_STAGING_CONCURRENCY = 8;

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
    sourceFiles,
  }: {
    frame: FileResource;
    manifest: FrameManifest;
    sourceFiles: ReadonlyArray<{ relativePath: string; content: Buffer }>;
  }
): Promise<Result<void, SandboxFunctionError>> {
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
  const stagingDirectory = path.posix.join(
    FRAME_DATABASE_STAGING_ROOT,
    randomUUID()
  );

  try {
    const stagingResults = await concurrentExecutor(
      sourceFiles,
      async (sourceFile) => {
        if (!isSafeFrameRelativePath(sourceFile.relativePath)) {
          return new Err(
            new Error(`Invalid Frame source path: ${sourceFile.relativePath}`)
          );
        }
        return sandbox.writeFile(
          auth,
          path.posix.join(stagingDirectory, sourceFile.relativePath),
          Uint8Array.from(sourceFile.content).buffer
        );
      },
      { concurrency: FRAME_DATABASE_STAGING_CONCURRENCY }
    );
    const stagingError = stagingResults.find((result) => result.isErr());
    if (stagingError?.isErr()) {
      return new Err(
        new SandboxFunctionError("internal", stagingError.error.message)
      );
    }

    for (const database of manifest.databases) {
      const reconcileResult = await reconcileDatabaseOnReadySandbox(auth, {
        sandbox,
        database: database.name,
        schemaFileSandboxPath: path.posix.join(
          stagingDirectory,
          database.schema
        ),
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
  } finally {
    await sandbox.exec(auth, `rm -rf -- ${shellEscape(stagingDirectory)}`, {
      user: "agent-proxied",
    });
  }
}
