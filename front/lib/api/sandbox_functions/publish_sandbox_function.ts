import path from "node:path";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { reconcileDatabaseOnSandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import {
  executeWithLock,
  LOCK_TTL_MS,
  LockAcquisitionTimeoutError,
} from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { sandboxFunctionContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { JSONSchema7 as JSONSchema } from "json-schema";

// The Redis lock is a best-effort mutex (LOCK_TTL_MS key TTL, front/lib/lock.ts) with a 30s
// acquisition wait: the ~2min build runs OUTSIDE it, and the store is protected by an
// optimistic updatedAt guard for sections that outlive the TTL.
const PUBLISH_LOCK_ACQUIRE_TIMEOUT_MS = 30_000;

/**
 * Publish a sandbox function: build the source the model wrote to the pod mount, reconcile
 * each declared database's live SQLite file (additive DDL only, destructive changes are
 * refused in-sandbox), then store the bundle and its contract.
 *
 * The bundle is stored as a single `project_context` FileResource with the sandbox-function
 * content type, which FileResource routes into the dedicated, front-only sandbox-functions
 * prefix. The SandboxFunctionResource is upserted on (space, slug): re-publish swaps the bundle,
 * otherwise a new row is created. Returns a domain Result, no HTTP shapes (BACK18).
 */
export async function publishSandboxFunction(
  auth: Authenticator,
  {
    space,
    slug,
    description,
    path: sourcePath,
  }: {
    space: SpaceResource;
    slug: string;
    description: string;
    path: string;
  }
): Promise<Result<SandboxFunctionResource, SandboxFunctionError>> {
  // Resolve the model-supplied scoped path (e.g. `pod-{id}/greet.ts`) to its absolute path inside
  // the sandbox, reusing DustFileSystem's traversal and mount checks rather than rebuilding them.
  const fsResult = await DustFileSystem.forPod(auth, space);
  if (fsResult.isErr()) {
    return new Err(
      new SandboxFunctionError("invalid_path", fsResult.error.message)
    );
  }
  const srcResult = fsResult.value.toSandboxPath(sourcePath);
  if (srcResult.isErr()) {
    return new Err(
      new SandboxFunctionError("invalid_path", srcResult.error.message)
    );
  }
  const srcSandboxPath = srcResult.value;

  // Build outside the publish lock: it can take minutes and holds no shared state.
  const buildResult = await buildSandboxFunctionOnSandbox(auth, {
    space,
    srcSandboxPath,
  });
  if (buildResult.isErr()) {
    return buildResult;
  }
  const { bundleCode, inputSchema, outputSchema, databases } =
    buildResult.value;

  // Serialize the reconcile -> store section per pod. Only the typed acquisition timeout is
  // retryable contention; anything else (Redis outage, bugs in the section) propagates
  // (ERR1: genuine failures 500).
  try {
    return await executeWithLock(
      `sandbox_function:publish:${space.sId}`,
      async () =>
        publishCriticalSection(auth, {
          space,
          slug,
          description,
          srcSandboxPath,
          bundleCode,
          inputSchema,
          outputSchema,
          databases,
        }),
      PUBLISH_LOCK_ACQUIRE_TIMEOUT_MS,
      { traceAcquireResource: "sandbox_function.publish" }
    );
  } catch (err) {
    if (err instanceof LockAcquisitionTimeoutError) {
      return new Err(
        new SandboxFunctionError(
          "publish_conflict",
          `Another publish is in progress for this pod; retry shortly. (${err.message})`
        )
      );
    }
    throw err;
  }
}

async function publishCriticalSection(
  auth: Authenticator,
  {
    space,
    slug,
    description,
    srcSandboxPath,
    bundleCode,
    inputSchema,
    outputSchema,
    databases,
  }: {
    space: SpaceResource;
    slug: string;
    description: string;
    srcSandboxPath: string;
    bundleCode: string;
    inputSchema: JSONSchema;
    outputSchema: JSONSchema;
    databases: Record<string, { schemaFile: string }> | null;
  }
): Promise<Result<SandboxFunctionResource, SandboxFunctionError>> {
  const sectionStartMs = Date.now();

  // Read before the reconcile execs: the optimistic guard in storePublishedFunction compares
  // updatedAt against this row, catching a concurrent publish that stored while this section
  // ran (the 5s lock TTL is not renewed).
  const existing = await SandboxFunctionResource.fetchBySpaceAndSlug(
    auth,
    space,
    slug
  );

  // Reconcile each declared database against its live SQLite file (additive DDL only). The
  // schema files live next to the function source, at the canonical databases/{db}.db.ts.
  // The GCS bundle upload cannot move before this gate: re-publish overwrites the live bundle
  // in place, so uploading before the reconciles pass would corrupt the published function on
  // a refusal.
  if (databases !== null) {
    const sourceDir = path.posix.dirname(srcSandboxPath);
    for (const [database, { schemaFile }] of Object.entries(databases)) {
      const reconcileResult = await reconcileDatabaseOnSandbox(auth, {
        space,
        database,
        schemaFileSandboxPath: path.posix.join(sourceDir, schemaFile),
      });
      if (reconcileResult.isErr()) {
        return reconcileResult;
      }
      // No replication wiring needed for a freshly created database: litestream (>= 0.5.13)
      // runs in directory-watch mode and picks it up automatically within seconds; the
      // pre-sleep pod-state health check is the durability backstop.
    }
  }

  const storeResult = await storePublishedFunction(auth, {
    space,
    slug,
    description,
    bundleCode,
    inputSchema,
    outputSchema,
    existing,
  });
  if (storeResult.isErr()) {
    return storeResult;
  }

  // Observability for the residual race: the Redis lock's TTL is not renewed, so a section
  // slower than the TTL ran partially unlocked (the optimistic store guard is the real
  // protection). Emit a metric + warn so we can see how often it happens.
  const sectionElapsedMs = Date.now() - sectionStartMs;
  if (sectionElapsedMs > LOCK_TTL_MS) {
    getStatsDClient().increment(
      "sandbox_functions.publish_lock_ttl_exceeded.count"
    );
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        podId: space.sId,
        slug,
        sectionElapsedMs,
        lockTtlMs: LOCK_TTL_MS,
      },
      "Sandbox function publish: critical section outlived the lock TTL"
    );
  }

  return storeResult;
}

interface PublishStoreArgs {
  space: SpaceResource;
  slug: string;
  description: string;
  bundleCode: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  existing: SandboxFunctionResource | null;
}

async function storePublishedFunction(
  auth: Authenticator,
  {
    space,
    slug,
    description,
    bundleCode,
    inputSchema,
    outputSchema,
    existing,
  }: PublishStoreArgs
): Promise<Result<SandboxFunctionResource, SandboxFunctionError>> {
  // Re-publish overwrites the existing bundle in place so its mount path (<prefix>/<slug>.ts)
  // stays stable; only a first publish creates the backing file.
  if (existing) {
    // Optimistic guard: the lock TTL may have expired mid-section, so the row is claimed
    // with a conditional update against the section's initial read before the bundle is
    // overwritten. A first publish is protected by the unique (workspaceId, spaceId, slug)
    // index instead.
    const updateResult = await existing.updateContent(auth, {
      bundleCode,
      description,
      inputSchema,
      outputSchema,
      expectedUpdatedAt: existing.updatedAt,
    });
    if (updateResult.isErr()) {
      return new Err(
        new SandboxFunctionError("internal", updateResult.error.message)
      );
    }
    if (updateResult.value === "conflict") {
      return new Err(
        new SandboxFunctionError(
          "publish_conflict",
          "A concurrent publish updated this function while this one was being checked; retry."
        )
      );
    }

    return new Ok(existing);
  }

  // A concurrent first publish may have stored while this section ran: re-check right before
  // creating so the race resolves to a typed conflict instead of a unique-index throw, and
  // before the bundle file exists so nothing is orphaned. The unique (workspaceId, spaceId,
  // slug) index stays the ultimate guard for the residual window.
  const concurrent = await SandboxFunctionResource.fetchBySpaceAndSlug(
    auth,
    space,
    slug
  );
  if (concurrent !== null) {
    return new Err(
      new SandboxFunctionError(
        "publish_conflict",
        "A concurrent publish created this function while this one was being checked; retry."
      )
    );
  }

  const fileResult = await createBundleFile(auth, { space, slug, bundleCode });
  if (fileResult.isErr()) {
    return fileResult;
  }

  const created = await SandboxFunctionResource.makeNew(auth, {
    space,
    file: fileResult.value,
    slug,
    description,
    inputSchema,
    outputSchema,
  });

  return new Ok(created);
}

async function createBundleFile(
  auth: Authenticator,
  {
    space,
    slug,
    bundleCode,
  }: { space: SpaceResource; slug: string; bundleCode: string }
): Promise<Result<FileResource, SandboxFunctionError>> {
  try {
    const file = await FileResource.makeNew({
      workspaceId: auth.getNonNullableWorkspace().id,
      userId: auth.user()?.id ?? null,
      contentType: sandboxFunctionContentType,
      fileName: `${slug}.ts`,
      fileSize: Buffer.byteLength(bundleCode, "utf8"),
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });

    await file.uploadContent(auth, bundleCode);

    return new Ok(file);
  } catch (err) {
    return new Err(
      new SandboxFunctionError("internal", normalizeError(err).message)
    );
  }
}
