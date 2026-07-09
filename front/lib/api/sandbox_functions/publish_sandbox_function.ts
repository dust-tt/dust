import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { sandboxFunctionContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Publish a sandbox function: build the source the model wrote to the pod mount, then store
 * the bundle and its contract. Publish neither validates nor touches pod databases — the
 * schema rules and the live files belong to `dsbx db reconcile`.
 *
 * Concurrency: no lock. A re-publish claims the row with a conditional update against the
 * updatedAt it read (updateContent), and a first publish re-checks right before creating the
 * bundle file, with the unique (workspaceId, spaceId, slug) index as the ultimate guard.
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

  const buildResult = await buildSandboxFunctionOnSandbox(auth, {
    space,
    srcSandboxPath: srcResult.value,
  });
  if (buildResult.isErr()) {
    return buildResult;
  }
  const { bundleCode, inputSchema, outputSchema } = buildResult.value;

  // Re-publish overwrites the existing bundle in place so its mount path (<prefix>/<slug>.ts)
  // stays stable; only a first publish creates the backing file.
  const existing = await SandboxFunctionResource.fetchBySpaceAndSlug(
    auth,
    space,
    slug
  );
  if (existing) {
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

  // A concurrent first publish may have stored while this one built: re-check right before
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
