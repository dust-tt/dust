import path from "node:path";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import type {
  CompatBlock,
  CompatWarning,
  SiblingState,
  StaleSiblingNote,
} from "@app/lib/api/sandbox_functions/compat";
import {
  computeStaleSiblings,
  diffStateAgainstSiblings,
} from "@app/lib/api/sandbox_functions/compat";
import { reconcileDatabaseOnSandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { FunctionState } from "@app/lib/api/sandbox_functions/manifests";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock } from "@app/lib/lock";
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

// The Redis lock is a 5s-TTL best-effort mutex (front/lib/lock.ts) with a 30s acquisition
// wait: the ~2min build runs OUTSIDE it, and the critical section re-reads Postgres state
// (fencing re-check) immediately before storing.
const PUBLISH_LOCK_ACQUIRE_TIMEOUT_MS = 30_000;
// Mirrors lockTimeout in front/lib/lock.ts (not exported there): sections slower than this ran
// partially unlocked — the fencing re-read + optimistic store guard carry correctness, this
// value only feeds the observability check.
const PUBLISH_LOCK_TTL_MS = 5_000;

export interface PublishSandboxFunctionOutcome {
  sandboxFunction: SandboxFunctionResource;
  // Non-blocking compat findings (mode drift, unique tightening).
  warnings: CompatWarning[];
  // Siblings whose stored manifest for a shared database now differs from this publish.
  staleSiblings: StaleSiblingNote[];
}

/**
 * Publish a sandbox function: build the source the model wrote to the pod mount, gate the
 * publish on manifest compatibility with the pod's other functions, reconcile each declared
 * database's live SQLite file (additive DDL only), then store the bundle and its contract.
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
): Promise<Result<PublishSandboxFunctionOutcome, SandboxFunctionError>> {
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
  const { bundleCode, inputSchema, outputSchema, manifests } =
    buildResult.value;

  // Serialize the compat-check -> reconcile -> store section per pod. The Redis lock helper
  // throws on acquisition timeout; that throw is mapped to a typed conflict error, while
  // anything thrown from inside the critical section propagates (ERR1: genuine bugs 500).
  let lockAcquired = false;
  try {
    return await executeWithLock(
      `sandbox_function:publish:${space.sId}`,
      async () => {
        lockAcquired = true;
        return publishCriticalSection(auth, {
          space,
          slug,
          description,
          srcSandboxPath,
          bundleCode,
          inputSchema,
          outputSchema,
          manifests,
        });
      },
      PUBLISH_LOCK_ACQUIRE_TIMEOUT_MS,
      { traceAcquireResource: "sandbox_function.publish" }
    );
  } catch (err) {
    if (!lockAcquired) {
      return new Err(
        new SandboxFunctionError(
          "publish_conflict",
          `Another publish is in progress for this pod; retry shortly. (${normalizeError(err).message})`
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
    manifests,
  }: {
    space: SpaceResource;
    slug: string;
    description: string;
    srcSandboxPath: string;
    bundleCode: string;
    inputSchema: JSONSchema;
    outputSchema: JSONSchema;
    manifests: FunctionState | null;
  }
): Promise<Result<PublishSandboxFunctionOutcome, SandboxFunctionError>> {
  const sectionStartMs = Date.now();

  // Compat gate against the current Postgres state (one query for all sibling manifests).
  const firstRead = await readPodManifests(auth, space, slug);
  const diff = diffStateAgainstSiblings({
    newState: manifests,
    previousState: firstRead.previousState,
    siblings: firstRead.siblings,
  });
  if (diff.blocks.length > 0) {
    return new Err(
      new SandboxFunctionError("compat_blocked", formatBlocks(diff.blocks))
    );
  }

  // Reconcile each declared database against its live SQLite file (additive DDL only). The
  // schema files live next to the function source, at the canonical databases/{db}.db.ts.
  if (manifests !== null) {
    const sourceDir = path.posix.dirname(srcSandboxPath);
    for (const [database, manifest] of Object.entries(manifests.databases)) {
      const reconcileResult = await reconcileDatabaseOnSandbox(auth, {
        space,
        database,
        schemaFileSandboxPath: path.posix.join(sourceDir, manifest.schemaFile),
      });
      if (reconcileResult.isErr()) {
        return reconcileResult;
      }
      // No replication wiring needed for a freshly created database: litestream (>= 0.5.13)
      // runs in directory-watch mode and picks it up automatically within seconds; the
      // pre-sleep sync barrier is the durability backstop.
    }
  }

  // Fencing re-check: the 5s-TTL lock may have silently expired during the reconcile execs, so
  // re-read the sibling manifests and re-run the (pure) diff immediately before storing. The
  // GCS bundle upload cannot move out of the section: re-publish overwrites the live bundle in
  // place, so uploading before the gates pass would corrupt the published function on a block.
  const secondRead = await readPodManifests(auth, space, slug);
  const fencingDiff = diffStateAgainstSiblings({
    newState: manifests,
    previousState: secondRead.previousState,
    siblings: secondRead.siblings,
  });
  if (fencingDiff.blocks.length > 0) {
    return new Err(
      new SandboxFunctionError(
        "compat_blocked",
        formatBlocks(fencingDiff.blocks)
      )
    );
  }

  const storeResult = await storePublishedFunction(auth, {
    space,
    slug,
    description,
    bundleCode,
    inputSchema,
    outputSchema,
    manifests,
    existing: secondRead.existing,
  });
  if (storeResult.isErr()) {
    return storeResult;
  }

  // Observability for the residual race: the Redis lock's 5s TTL is not renewed, so a section
  // slower than the TTL ran partially unlocked (the fencing re-read + optimistic store guard
  // are the real protection). Emit a metric + warn so we can see how often it happens.
  const sectionElapsedMs = Date.now() - sectionStartMs;
  if (sectionElapsedMs > PUBLISH_LOCK_TTL_MS) {
    getStatsDClient().increment(
      "sandbox_functions.publish_lock_ttl_exceeded.count"
    );
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        podId: space.sId,
        slug,
        sectionElapsedMs,
        lockTtlMs: PUBLISH_LOCK_TTL_MS,
      },
      "Sandbox function publish: critical section outlived the lock TTL"
    );
  }

  return new Ok({
    sandboxFunction: storeResult.value,
    warnings: fencingDiff.warnings,
    staleSiblings: computeStaleSiblings(manifests, secondRead.siblings),
  });
}

async function readPodManifests(
  auth: Authenticator,
  space: SpaceResource,
  slug: string
): Promise<{
  existing: SandboxFunctionResource | null;
  previousState: FunctionState | null;
  siblings: SiblingState[];
}> {
  // One query: manifests live on the sandbox_functions rows themselves (GEN14).
  const functions = await SandboxFunctionResource.listBySpace(auth, space);
  const existing = functions.find((fn) => fn.slug === slug) ?? null;

  return {
    existing,
    previousState: existing?.manifests ?? null,
    siblings: functions
      .filter((fn) => fn.slug !== slug)
      .map((fn) => ({ slug: fn.slug, state: fn.manifests ?? null })),
  };
}

interface PublishStoreArgs {
  space: SpaceResource;
  slug: string;
  description: string;
  bundleCode: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  manifests: FunctionState | null;
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
    manifests,
    existing,
  }: PublishStoreArgs
): Promise<Result<SandboxFunctionResource, SandboxFunctionError>> {
  // Re-publish overwrites the existing bundle in place so its mount path (<prefix>/<slug>.ts)
  // stays stable; only a first publish creates the backing file.
  if (existing) {
    // Optimistic guard: the 5s lock TTL may have expired mid-section, so verify no concurrent
    // publish stored a newer version since the fenced re-read (updatedAt compare). A first
    // publish is protected by the unique (workspaceId, spaceId, slug) index instead.
    const current = await SandboxFunctionResource.fetchBySpaceAndSlug(
      auth,
      space,
      slug
    );
    if (
      current === null ||
      current.updatedAt.getTime() !== existing.updatedAt.getTime()
    ) {
      return new Err(
        new SandboxFunctionError(
          "publish_conflict",
          "A concurrent publish updated this function while this one was being checked; retry."
        )
      );
    }

    const updateResult = await existing.updateContent(auth, {
      bundleCode,
      description,
      inputSchema,
      outputSchema,
      manifests,
    });
    if (updateResult.isErr()) {
      return new Err(
        new SandboxFunctionError("internal", updateResult.error.message)
      );
    }

    return new Ok(existing);
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
    manifests,
  });

  return new Ok(created);
}

function formatBlocks(blocks: CompatBlock[]): string {
  const lines = blocks.map(
    (block) =>
      `- ${block.reason} (breaks: ${block.affectedFunctions.join(", ")})`
  );
  return [
    "Publish blocked: this schema change would break published functions of this pod.",
    ...lines,
    "Fix additively instead: keep the existing tables and columns declared in the shared " +
      "databases/{db}.db.ts, add new columns/tables alongside (nullable or with a default), " +
      "dual-write during the transition, and republish the affected functions.",
  ].join("\n");
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
