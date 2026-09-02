import {
  type CallFrameFunctionFromSourceError,
  type FrameFunctionCallError,
  isFrameFunctionExecutionError,
} from "@app/lib/api/frames/call_frame_function";
import { isValidSandboxFunctionSlug } from "@app/types/api/sandbox_functions";
import {
  type DustFileSystemError,
  isDustFileSystemError,
} from "@app/types/file_system";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { getSandboxFunctionInvocationErrorStatusCode } from "@front-api/lib/api/sandbox_function_invocation_errors";
import { z } from "zod";

export const FrameFunctionCallRequestSchema = z.object({
  functionName: z.string().refine(isValidSandboxFunctionSlug),
  input: z.unknown().optional(),
});

export const FrameFunctionCallFromSourceRequestSchema =
  FrameFunctionCallRequestSchema.extend({
    sourcePath: z.string().min(1),
  });

function frameCallErrorStatus(
  error: FrameFunctionCallError
): 400 | 403 | 404 | 500 {
  switch (error.code) {
    case "invalid_source":
      return 400;
    case "unauthorized":
      return 403;
    case "frame_not_found":
    case "function_not_found":
      return 404;
    default:
      return assertNever(error.code);
  }
}

function fileSystemErrorStatus(error: DustFileSystemError): 400 | 403 | 500 {
  switch (error.code) {
    case "unauthorized":
      return 403;
    case "internal":
      return 500;
    case "already_exists":
    case "invalid_path":
    case "legacy_path":
    case "not_found":
    case "too_many_mounts":
      return 400;
    default:
      return assertNever(error.code);
  }
}

export function frameFunctionCallApiError(
  error: CallFrameFunctionFromSourceError
): {
  statusCode: 400 | 401 | 403 | 404 | 409 | 500;
  type:
    | "frame_runtime_unavailable"
    | "internal_server_error"
    | "invalid_request_error"
    | "user_authentication_required";
  message: string;
} {
  if (isFrameFunctionExecutionError(error)) {
    const { callError } = error;
    if (
      callError.code === "user_authentication_required" ||
      callError.code === "frame_runtime_unavailable"
    ) {
      return {
        statusCode: getSandboxFunctionInvocationErrorStatusCode(callError.code),
        type: callError.code,
        message: callError.message,
      };
    }
    const statusCode =
      callError.code === "invocation_failed" ||
      callError.code === "transport_error"
        ? 500
        : 400;
    return {
      statusCode,
      type:
        statusCode === 500 ? "internal_server_error" : "invalid_request_error",
      message: `Frame function "${error.functionName}" returned an error (${callError.code}): ${callError.message}`,
    };
  }

  const statusCode = isDustFileSystemError(error)
    ? fileSystemErrorStatus(error)
    : frameCallErrorStatus(error);
  return {
    statusCode,
    type:
      statusCode === 500 ? "internal_server_error" : "invalid_request_error",
    message: error.message,
  };
}
