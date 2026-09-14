import path from "node:path";

import { DustFileSystem } from "@app/lib/api/file_system";
import { callSandboxFunction } from "@app/lib/api/sandbox_functions/call_sandbox_function";
import { resolveActiveFrameFunctionForUse } from "@app/lib/api/sandbox_functions/frame_share_capability";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { SandboxFunctionCallError } from "@app/types/api/sandbox_functions";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { DustFileSystemError } from "@app/types/file_system";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export class FrameFunctionCallError extends Error {
  constructor(
    readonly code:
      | "invalid_source"
      | "unauthorized"
      | "frame_not_found"
      | "function_not_found",
    message: string
  ) {
    super(message);
    this.name = "FrameFunctionCallError";
  }
}

export class FrameFunctionExecutionError extends Error {
  readonly code = "call_failed" as const;

  constructor(
    readonly functionName: string,
    readonly callError: SandboxFunctionCallError
  ) {
    super(callError.message);
    this.name = "FrameFunctionExecutionError";
  }
}

export function isFrameFunctionExecutionError(
  error: unknown
): error is FrameFunctionExecutionError {
  return error instanceof FrameFunctionExecutionError;
}

export type CallFrameFunctionError =
  | FrameFunctionCallError
  | FrameFunctionExecutionError;

export type CallFrameFunctionFromSourceError =
  | DustFileSystemError
  | CallFrameFunctionError;

export type CallFrameFunctionResult = {
  frameId: string;
  functionName: string;
  result: unknown;
};

/** Invoke one function from a Frame's active publication after checking use rights. */
export async function callFrameFunction(
  auth: Authenticator,
  {
    frameId,
    functionName,
    input,
  }: {
    frameId: string;
    functionName: string;
    input?: unknown;
  }
): Promise<Result<CallFrameFunctionResult, CallFrameFunctionError>> {
  const sandboxFunction = await resolveActiveFrameFunctionForUse(auth, {
    frameId,
    functionName,
  });
  if (!sandboxFunction) {
    return new Err(
      new FrameFunctionCallError(
        "function_not_found",
        `No active function named "${functionName}" found for this Frame.`
      )
    );
  }

  const callResult = await callSandboxFunction(auth, sandboxFunction, input);
  if (callResult.isErr()) {
    return new Err(
      new FrameFunctionExecutionError(functionName, callResult.error)
    );
  }

  return new Ok({
    frameId,
    functionName,
    result: callResult.value,
  });
}

/** Resolve a registered Frame from its mounted source and invoke its active function. */
export async function callFrameFunctionFromSource(
  auth: Authenticator,
  {
    conversation,
    sourcePath,
    functionName,
    input,
  }: {
    conversation: ConversationWithoutContentType;
    sourcePath: string;
    functionName: string;
    input?: unknown;
  }
): Promise<Result<CallFrameFunctionResult, CallFrameFunctionFromSourceError>> {
  const normalizedSourcePath = DustFileSystem.normalizeScopedPath(sourcePath);
  if (!normalizedSourcePath || !normalizedSourcePath.includes("/")) {
    return new Err(
      new FrameFunctionCallError(
        "invalid_source",
        "Frame source must point to its folder or manifest.json."
      )
    );
  }
  const manifestPath =
    path.posix.basename(normalizedSourcePath) === FRAME_MANIFEST_FILE
      ? normalizedSourcePath
      : path.posix.join(normalizedSourcePath, FRAME_MANIFEST_FILE);

  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(fsResult.error);
  }
  const dustFs = fsResult.value;
  if (!dustFs.isGCSBacked()) {
    return new Err(
      new FrameFunctionCallError(
        "invalid_source",
        "Frames v2 calls do not support the database-backed filesystem."
      )
    );
  }

  const readableMount = dustFs
    .getMounts()
    .find(
      (mount) =>
        manifestPath.startsWith(`${mount.scopedPrefix}/`) &&
        mount.permissions.canRead
    );
  if (!readableMount) {
    return new Err(
      new FrameFunctionCallError(
        "unauthorized",
        "Read access to the Frame source folder is required."
      )
    );
  }

  const mountFilePath = dustFs.toMountFilePath(manifestPath);
  if (!mountFilePath) {
    return new Err(
      new FrameFunctionCallError("invalid_source", "Invalid Frame source path.")
    );
  }
  const [frame] = await FileResource.fetchByMountFilePaths(auth, [
    mountFilePath,
  ]);
  if (!frame?.isFrameV2) {
    return new Err(
      new FrameFunctionCallError(
        "frame_not_found",
        `No registered Frames v2 package found at ${normalizedSourcePath}.`
      )
    );
  }

  return callFrameFunction(auth, {
    frameId: frame.sId,
    functionName,
    input,
  });
}
