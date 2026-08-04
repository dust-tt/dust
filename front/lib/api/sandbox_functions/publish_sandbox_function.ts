import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { SandboxFunctionUserIdentityPolicy } from "@app/types/api/sandbox_functions";
import { sandboxFunctionContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Publish a sandbox function: build the source the model wrote to the pod mount, then store the
 * bundle and its extracted contract.
 *
 * The bundle is stored as a single `project_context` FileResource with the sandbox-function content
 * type, which FileResource routes into the dedicated, front-only sandbox-functions prefix. The
 * SandboxFunctionResource is upserted on (space, slug): re-publish swaps the bundle, otherwise a new
 * row is created. Returns a domain Result, no HTTP shapes (BACK18).
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
  const { bundleCode, userIdentity, inputSchema, outputSchema } =
    buildResult.value;

  // Re-publish overwrites the existing bundle in place so its mount path (<prefix>/<slug>.ts) stays
  // stable; only a first publish creates the backing file.
  const existing = await SandboxFunctionResource.fetchBySpaceAndSlug(
    auth,
    space,
    slug
  );
  if (existing) {
    // Read before updateContent: BaseResource.update assigns the new values onto the instance, so
    // reading afterwards would report the incoming policy as the previous one.
    const previousUserIdentity = existing.userIdentity ?? "optional";

    const updateResult = await existing.updateContent(auth, {
      bundleCode,
      description,
      userIdentity,
      inputSchema,
      outputSchema,
    });
    if (updateResult.isErr()) {
      return new Err(
        new SandboxFunctionError("internal", updateResult.error.message)
      );
    }

    emitPodFunctionPublishedAuditEvent(auth, {
      space,
      sandboxFunction: existing,
      operation: "updated",
      previousUserIdentity,
    });

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
    userIdentity,
    inputSchema,
    outputSchema,
  });

  emitPodFunctionPublishedAuditEvent(auth, {
    space,
    sandboxFunction: created,
    operation: "created",
    previousUserIdentity: null,
  });

  return new Ok(created);
}

/**
 * Publishing puts executable code behind a callable endpoint on a Pod's shared runtime, so it is
 * audited even though functions are not a user-facing concept. `user_identity` is declared in the
 * function source rather than passed in, which means a re-publish can widen who is allowed to call
 * an existing function: both the new and previous policy are recorded so that change is visible.
 */
function emitPodFunctionPublishedAuditEvent(
  auth: Authenticator,
  {
    space,
    sandboxFunction,
    operation,
    previousUserIdentity,
  }: {
    space: SpaceResource;
    sandboxFunction: SandboxFunctionResource;
    operation: "created" | "updated";
    previousUserIdentity: SandboxFunctionUserIdentityPolicy | null;
  }
): void {
  void emitAuditLogEvent({
    auth,
    action: "pod_function.published",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("space", space),
      buildAuditLogTarget("pod_function", {
        sId: sandboxFunction.sId,
        name: sandboxFunction.slug,
      }),
    ],
    metadata: {
      operation,
      pod_function_slug: sandboxFunction.slug,
      user_identity: sandboxFunction.userIdentity ?? "optional",
      ...(previousUserIdentity
        ? { previous_user_identity: previousUserIdentity }
        : {}),
      file_id: sandboxFunction.file.sId,
    },
  });
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
