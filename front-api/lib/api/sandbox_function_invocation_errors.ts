import type { SandboxFunctionInvocationErrorCode } from "@app/lib/api/sandbox_functions/errors";
import { assertNever } from "@app/types/shared/utils/assert_never";

export function getSandboxFunctionInvocationErrorStatusCode(
  code: SandboxFunctionInvocationErrorCode
): 401 | 409 {
  switch (code) {
    case "user_authentication_required":
      return 401;
    case "frame_runtime_unavailable":
      return 409;
    default:
      return assertNever(code);
  }
}
