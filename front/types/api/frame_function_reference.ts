import type { PodFunctionScope } from "@app/types/api/pod_function_reference";
import {
  isRelativePodFunctionReference,
  resolvePodFunctionReference,
} from "@app/types/api/pod_function_reference";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type FrameFunctionReferenceScope =
  | { kind: "v2"; frameId: string }
  | { kind: "legacy"; podFunctionScope: PodFunctionScope | null };

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
