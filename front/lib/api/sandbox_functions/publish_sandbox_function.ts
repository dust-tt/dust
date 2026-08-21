import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { lintSandboxFunctionPublish } from "@app/lib/api/sandbox_functions/publish_lints";
import { deriveSandboxFunctionSlug } from "@app/lib/api/sandbox_functions/slug";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import {
  computeSandboxFunctionBundleSha256,
  SandboxFunctionResource,
} from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type {
  SandboxFunctionExecutionMode,
  SandboxFunctionStake,
} from "@app/types/api/sandbox_functions";
import { DEFAULT_SANDBOX_FUNCTION_EXECUTION_MODE } from "@app/types/api/sandbox_functions";
import { sandboxFunctionContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export type PublishSandboxFunctionResult = {
  sandboxFunction: SandboxFunctionResource;
  // True when a re-publish produced a bundle byte-identical to the one it replaced: the edit the
  // publisher thinks they made did not change the built output. Always false on a first publish.
  byteIdentical: boolean;
  // Advisory lint findings over the built bundle and contract (see publish_lints.ts). Never
  // block the publish; the tool appends them to its result text.
  warnings: string[];
};

/**
 * Publish a sandbox function: build the source the model wrote to the pod mount, then store the
 * bundle and its extracted contract.
 *
 * The bundle is stored as a single `project_context` FileResource with the sandbox-function content
 * type, which FileResource routes into the dedicated, front-only sandbox-functions prefix. The
 * SandboxFunctionResource is upserted on (space, slug): re-publish swaps the bundle, otherwise a new
 * row is created. `slug` here is the caller's bare function name; the stored slug prefixes it with
 * the app folder the source lives in (see deriveSandboxFunctionSlug), so the upsert is scoped to one
 * app rather than the whole pod. Returns a domain Result, no HTTP shapes (BACK18).
 */
export async function publishSandboxFunction(
  auth: Authenticator,
  {
    space,
    slug,
    description,
    path: sourcePath,
    executionMode,
    defaultStake,
    confirmFast,
  }: {
    space: SpaceResource;
    slug: string;
    description: string;
    path: string;
    executionMode?: SandboxFunctionExecutionMode;
    defaultStake?: SandboxFunctionStake;
    // Publisher's confirmation that a `fast` publish flagged by the tool-call lint is
    // intentional; suppresses that warning only (see publish_lints.ts).
    confirmFast?: boolean;
  }
): Promise<Result<PublishSandboxFunctionResult, SandboxFunctionError>> {
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

  // The published slug namespaces the caller's name under the app folder the source lives in, so
  // two apps in one pod can each own a function called `refresh`. Derived before the build so a
  // misplaced source fails without paying for a bundle.
  const slugResult = deriveSandboxFunctionSlug({
    sourcePath,
    podId: space.sId,
    name: slug,
  });
  if (slugResult.isErr()) {
    return new Err(
      new SandboxFunctionError("invalid_path", slugResult.error.message)
    );
  }
  const qualifiedSlug = slugResult.value;

  const buildResult = await buildSandboxFunctionOnSandbox(auth, {
    space,
    srcSandboxPath: srcResult.value,
  });
  if (buildResult.isErr()) {
    return buildResult;
  }
  const { bundleCode, userIdentity, inputSchema, outputSchema } =
    buildResult.value;

  // Lint the built output rather than the source: the bundle is what runs, and helpers pulled in
  // from `functions/lib/` only appear here. Runs on the caller's requested mode, i.e. the mode
  // the function will be stored with.
  const warnings = lintSandboxFunctionPublish({
    bundleCode,
    executionMode: executionMode ?? DEFAULT_SANDBOX_FUNCTION_EXECUTION_MODE,
    inputSchema,
    confirmFast,
  });

  // Re-publish overwrites the existing bundle in place so its mount path (<prefix>/<slug>.ts) stays
  // stable; only a first publish creates the backing file.
  const existing = await SandboxFunctionResource.fetchBySpaceAndSlug(
    auth,
    space,
    qualifiedSlug
  );
  if (existing) {
    const updateResult = await existing.updateContent(auth, {
      bundleCode,
      description,
      userIdentity,
      executionMode,
      defaultStake,
      inputSchema,
      outputSchema,
    });
    if (updateResult.isErr()) {
      return new Err(
        new SandboxFunctionError("internal", updateResult.error.message)
      );
    }

    return new Ok({
      sandboxFunction: existing,
      byteIdentical: updateResult.value.byteIdentical,
      warnings,
    });
  }

  const fileResult = await createBundleFile(auth, {
    space,
    slug: qualifiedSlug,
    bundleCode,
  });
  if (fileResult.isErr()) {
    return fileResult;
  }

  const created = await SandboxFunctionResource.makeNew(auth, {
    space,
    file: fileResult.value,
    slug: qualifiedSlug,
    description,
    userIdentity,
    executionMode,
    defaultStake,
    bundleSha256: computeSandboxFunctionBundleSha256(bundleCode),
    inputSchema,
    outputSchema,
  });

  return new Ok({ sandboxFunction: created, byteIdentical: false, warnings });
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
