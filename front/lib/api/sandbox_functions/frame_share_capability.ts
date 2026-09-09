import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { isValidSandboxFunctionSlug } from "@app/types/api/sandbox_functions";

/**
 * Resolve a caller-facing Frame function. Frames v2 accepts `<frameId>/<slug>` for new
 * invocations and function ids for an active publication (or an explicitly allowed in-flight
 * publication), with use rights read from the Frame's sharing record.
 */
export async function resolveSandboxFunctionWithCapability(
  auth: Authenticator,
  functionIdOrSlug: string,
  {
    allowInactiveFramePublication = false,
  }: { allowInactiveFramePublication?: boolean } = {}
): Promise<SandboxFunctionResource | null> {
  const featureFlags = await getFeatureFlags(auth);
  const isFramesV2Enabled = featureFlags.includes("frames_v2");
  if (!isFramesV2Enabled) {
    return null;
  }

  if (isResourceSId("sandbox_function", functionIdOrSlug)) {
    const sandboxFunction =
      await SandboxFunctionResource.fetchByIdForInvocationResolution(
        auth,
        functionIdOrSlug
      );
    if (sandboxFunction?.frame) {
      return resolveFrameV2FunctionAccess(auth, sandboxFunction, {
        allowInactivePublication: allowInactiveFramePublication,
      });
    }
    return null;
  }

  return resolveFrameV2FunctionReference(auth, functionIdOrSlug);
}

async function resolveFrameV2FunctionReference(
  auth: Authenticator,
  functionIdOrReference: string
): Promise<SandboxFunctionResource | null> {
  const [frameId, slug, ...rest] = functionIdOrReference.split("/");
  if (
    !frameId ||
    !slug ||
    rest.length > 0 ||
    !isResourceSId("file", frameId) ||
    !isValidSandboxFunctionSlug(slug)
  ) {
    return null;
  }
  return resolveActiveFrameFunctionForUse(auth, {
    frameId,
    functionName: slug,
  });
}

/** Resolve one function from the active publication of a Frame the caller may use. */
export async function resolveActiveFrameFunctionForUse(
  auth: Authenticator,
  {
    frameId,
    functionName,
  }: {
    frameId: string;
    functionName: string;
  }
): Promise<SandboxFunctionResource | null> {
  if (
    !isResourceSId("file", frameId) ||
    !isValidSandboxFunctionSlug(functionName)
  ) {
    return null;
  }

  const frame = await FileResource.fetchById(auth, frameId);
  const publicationId = frame?.useCaseMetadata?.activePublicationId;
  if (
    !frame?.isFrameV2 ||
    !publicationId ||
    !(await frame.canCurrentUserUseFrame(auth))
  ) {
    return null;
  }

  const sandboxFunction =
    await SandboxFunctionResource.fetchByFramePublicationAndSlug(auth, {
      frame,
      publicationId,
      slug: functionName,
    });
  return resolveFrameV2FunctionAccess(auth, sandboxFunction, {
    allowInactivePublication: false,
  });
}

async function resolveFrameV2FunctionAccess(
  auth: Authenticator,
  sandboxFunction: SandboxFunctionResource | null,
  { allowInactivePublication }: { allowInactivePublication: boolean }
): Promise<SandboxFunctionResource | null> {
  const frame = sandboxFunction?.frame;
  if (
    !sandboxFunction ||
    !frame ||
    !(await frame.canCurrentUserUseFrame(auth))
  ) {
    return null;
  }
  if (
    !allowInactivePublication &&
    sandboxFunction.publicationId !== frame.useCaseMetadata?.activePublicationId
  ) {
    return null;
  }
  return sandboxFunction;
}
