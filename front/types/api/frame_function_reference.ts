import type { PodFunctionScope } from "@app/types/api/pod_function_reference";
import {
  isRelativePodFunctionReference,
  resolvePodFunctionReference,
} from "@app/types/api/pod_function_reference";
import { frameV2ContentType, isInteractiveContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type FrameFunctionReferenceScope =
  | { kind: "v2"; frameId: string }
  | { kind: "legacy"; podFunctionScope: PodFunctionScope | null };

export type FrameFunctionReferenceKind = FrameFunctionReferenceScope["kind"];

/** Classify only known Frame MIME types. Missing metadata must never imply a legacy Frame. */
export function getFrameFunctionReferenceKind(
  contentType: string | null | undefined
): FrameFunctionReferenceKind | null {
  if (contentType === frameV2ContentType) {
    return "v2";
  }
  if (contentType && isInteractiveContentType(contentType)) {
    return "legacy";
  }
  return null;
}

/** Resolve the function reference emitted by a Frame against that Frame's trusted host identity. */
export function resolveFrameFunctionReference(
  reference: string,
  scope: FrameFunctionReferenceScope
): Result<string, Error> {
  switch (scope.kind) {
    case "v2":
      if (!isRelativePodFunctionReference(reference)) {
        return new Err(
          new Error(
            `'${reference}' is not a Frames v2 function name: expected a bare manifest function name.`
          )
        );
      }
      return new Ok(`${scope.frameId}/${reference}`);
    case "legacy":
      return resolvePodFunctionReference(reference, scope.podFunctionScope);
    default:
      return assertNever(scope);
  }
}
