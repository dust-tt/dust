import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { FramePublicationTarget } from "@app/types/api/frame_publication";
import { isValidSandboxFunctionSlug } from "@app/types/api/sandbox_functions";
import { isFramesV2FunctionsEnabled } from "@app/types/shared/feature_flags";

/**
 * Resolve a caller-facing Frame function. Frames v2 accepts `<frameId>/<slug>` for new
 * invocations and function ids for an active publication (or an explicitly allowed in-flight
 * publication), with use rights read from the Frame's sharing record.
 */
/**
 * @cc [owner:davidebbo,label:product;security] frame-functions-require-feature
 * Frame function resolution MUST return null unless Frame functions are enabled for the workspace
 * (see isFramesV2FunctionsEnabled), whatever publication or sharing state the Frame is in.
 */
/**
 * @cc [owner:davidebbo,label:product;security] frame-draft-functions-require-write-access
 * A draft publication's functions MUST resolve only when the caller asks for `target: "latest"`
 * and can write the Frame's source (`canWriteFrameV2Source`). A caller who cannot write the Frame
 * and asks for `latest` MUST be served the live publication, as must every `live` caller. The one
 * exception is `allowInactiveFramePublication` resolution, used only to act on an existing
 * invocation: it may resolve any publication because invocation reads are scoped to the caller's
 * own invocations.
 */
export async function resolveSandboxFunctionWithCapability(
  auth: Authenticator,
  functionIdOrSlug: string,
  {
    allowInactiveFramePublication = false,
    target = "live",
  }: {
    allowInactiveFramePublication?: boolean;
    target?: FramePublicationTarget;
  } = {}
): Promise<SandboxFunctionResource | null> {
  const featureFlags = await getFeatureFlags(auth);
  if (!isFramesV2FunctionsEnabled(featureFlags)) {
    return null;
  }

  if (isResourceSId("sandbox_function", functionIdOrSlug)) {
    const sandboxFunction =
      await SandboxFunctionResource.fetchByIdForInvocationResolution(
        auth,
        functionIdOrSlug
      );
    return resolveFrameV2FunctionAccess(auth, sandboxFunction, {
      publication: allowInactiveFramePublication ? "any" : "live",
    });
  }

  return resolveFrameV2FunctionReference(auth, functionIdOrSlug, target);
}

async function resolveFrameV2FunctionReference(
  auth: Authenticator,
  functionIdOrReference: string,
  target: FramePublicationTarget
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
    target,
  });
}

/**
 * @cc [owner:davidebbo,label:product;security] frame-functions-require-feature
 * Frame function resolution MUST return null unless Frame functions are enabled for the workspace
 * (see isFramesV2FunctionsEnabled), whatever publication or sharing state the Frame is in.
 */
/**
 * Draft publications resolve only for `target: "latest"` from a caller who can write the Frame;
 * every other caller, `latest` included, is served live. See the
 * `frame-draft-functions-require-write-access` contract on `resolveSandboxFunctionWithCapability`.
 */
/** Resolve one function from the live or latest publication of a Frame the caller may use. */
export async function resolveActiveFrameFunctionForUse(
  auth: Authenticator,
  {
    frameId,
    functionName,
    target,
  }: {
    frameId: string;
    functionName: string;
    target: FramePublicationTarget;
  }
): Promise<SandboxFunctionResource | null> {
  const featureFlags = await getFeatureFlags(auth);
  if (
    !isFramesV2FunctionsEnabled(featureFlags) ||
    !isResourceSId("file", frameId) ||
    !isValidSandboxFunctionSlug(functionName)
  ) {
    return null;
  }

  const frame = await FileResource.fetchById(auth, frameId);
  if (!frame?.isFrameV2 || !(await frame.canCurrentUserUseFrame(auth))) {
    return null;
  }
  const servedTarget: FramePublicationTarget =
    target === "latest" && (await canWriteFrameV2Source(auth, frame))
      ? "latest"
      : "live";
  const publicationId = frame.framePublicationIdFor(servedTarget);
  if (!publicationId) {
    return null;
  }

  const sandboxFunction =
    await SandboxFunctionResource.fetchByFramePublicationAndSlug(auth, {
      frame,
      publicationId,
      slug: functionName,
    });
  return resolveFrameV2FunctionAccess(auth, sandboxFunction, {
    publication: servedTarget,
  });
}

async function resolveFrameV2FunctionAccess(
  auth: Authenticator,
  sandboxFunction: SandboxFunctionResource | null,
  { publication }: { publication: "any" | FramePublicationTarget }
): Promise<SandboxFunctionResource | null> {
  if (!sandboxFunction) {
    return null;
  }
  const { frame } = sandboxFunction;
  if (!(await frame.canCurrentUserUseFrame(auth))) {
    return null;
  }
  if (publication === "any") {
    return sandboxFunction;
  }
  // Re-checked on the function's freshly loaded Frame: fail closed if the pointer moved.
  const servedPublicationId = frame.framePublicationIdFor(publication);
  return sandboxFunction.publicationId === servedPublicationId
    ? sandboxFunction
    : null;
}
