import { createHash, randomBytes } from "node:crypto";
import { canServePublicFrameFunctions } from "@app/lib/api/frames/public_frame_functions_policy";
import { runOnRedis } from "@app/lib/api/redis";
import { awaitSandboxFunctionInvocationOutcome } from "@app/lib/api/sandbox_functions/await_invocation";
import type { SandboxFunctionInvocationStreamEvent } from "@app/lib/api/sandbox_functions/events";
import { validateWorkspaceAccess } from "@app/lib/api/workspace_validation";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type {
  PostPublicFrameFunctionInvocationResponseBody,
  PostSandboxFunctionInvocationRequestBody,
  SandboxFunctionCallError,
  SandboxFunctionCallErrorCode,
  SandboxFunctionInvocationOutcome,
} from "@app/types/api/sandbox_functions";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { z } from "zod";

const PUBLIC_INVOCATION_RESULT_TOKEN_TTL_SECONDS = 15 * 60;

const PublicInvocationResultRecordSchema = z.object({
  frameId: z.string(),
  invocationId: z.string(),
});

type PublicInvocationResultRecord = z.infer<
  typeof PublicInvocationResultRecordSchema
>;

export type PublicFrameShare = {
  auth: Authenticator;
  frame: FileResource;
};

/**
 * @cc [owner:achilleburah,label:security] public-function-routes-ignore-sessions
 * The share MUST be resolved from the share token alone and its Authenticator MUST be the
 * anonymous Authenticator of the Frame's workspace. Routes serving public Frame functions MUST authenticate
 * through this function only and MUST NOT read a session cookie or a bearer token, so a signed-in
 * member calling them is anonymous.
 */
/**
 * @cc [owner:achilleburah,label:security;product] public-share-resolution-requires-public-functions
 * Null MUST be returned unless the token resolves to a Frames v2 file whose workspace passes
 * `validateWorkspaceAccess` and for which `canServePublicFrameFunctions` holds.
 */
export async function resolvePublicFrameShare(
  shareToken: string
): Promise<PublicFrameShare | null> {
  const shareResult = await FileResource.fetchByShareToken(shareToken);
  if (shareResult.isErr() || !shareResult.value.file.isFrameV2) {
    return null;
  }

  const { file, shareScope, workspace } = shareResult.value;
  const auth = await Authenticator.anonymousForWorkspace(workspace.sId);
  if (
    validateWorkspaceAccess(auth) !== null ||
    !(await canServePublicFrameFunctions(auth, shareScope))
  ) {
    return null;
  }

  return { auth, frame: file };
}

const FORWARDED_ERROR_MESSAGE_CODES: ReadonlySet<SandboxFunctionCallErrorCode> =
  new Set<SandboxFunctionCallErrorCode>([
    "bad_input",
    "invalid_input",
    "overloaded",
    "user_authentication_required",
  ]);

/**
 * @cc [owner:achilleburah,label:security] public-call-errors-sanitized
 * Before an error reaches an anonymous caller, its message MUST be replaced by a generic one unless
 * its code is `bad_input`, `invalid_input`, `overloaded` or `user_authentication_required`. The
 * code and status MUST be kept.
 */
export function sanitizePublicCallError(
  error: SandboxFunctionCallError
): SandboxFunctionCallError {
  return FORWARDED_ERROR_MESSAGE_CODES.has(error.code)
    ? error
    : { ...error, message: "The Frame function failed." };
}

function sanitizePublicOutcome(
  outcome: SandboxFunctionInvocationOutcome
): SandboxFunctionInvocationOutcome {
  switch (outcome.status) {
    case "succeeded":
      return outcome;
    case "errored":
      return {
        status: "errored",
        error: sanitizePublicCallError(outcome.error),
      };
    default:
      return assertNever(outcome);
  }
}

export function toPublicInvocationStreamEvent(
  event: SandboxFunctionInvocationStreamEvent
): SandboxFunctionInvocationStreamEvent | null {
  const { data } = event;
  switch (data.type) {
    case "sandbox_function_invocation_created":
    case "sandbox_function_invocation_result":
      return event;
    case "sandbox_function_invocation_error":
      return {
        ...event,
        data: { ...data, error: sanitizePublicCallError(data.error) },
      };
    case "tool_approve_execution":
    case "tool_personal_auth_required":
      return null;
    default:
      assertNeverAndIgnore(data);
      return null;
  }
}

function hashResultToken(resultToken: string): string {
  return createHash("sha256").update(resultToken).digest("hex");
}

function publicInvocationResultKey(resultTokenHash: string): string {
  return `public_frame_invocation_result:${resultTokenHash}`;
}

async function mintPublicInvocationResultToken(
  record: PublicInvocationResultRecord
): Promise<string> {
  const resultToken = randomBytes(32).toString("base64url");
  await runOnRedis(
    { origin: "public_frame_invocation_results" },
    async (redis) => {
      await redis.set(
        publicInvocationResultKey(hashResultToken(resultToken)),
        JSON.stringify(record),
        { EX: PUBLIC_INVOCATION_RESULT_TOKEN_TTL_SECONDS }
      );
    }
  );

  return resultToken;
}

export async function resolvePublicFrameFunction(
  { auth, frame }: PublicFrameShare,
  functionName: string
): Promise<SandboxFunctionResource | null> {
  const publicationId = frame.useCaseMetadata?.activePublicationId;
  if (!publicationId) {
    return null;
  }

  return SandboxFunctionResource.fetchByFramePublicationAndSlug(auth, {
    frame,
    publicationId,
    slug: functionName,
  });
}

type InvokePublicFrameFunctionInput = {
  sandboxFunction: SandboxFunctionResource;
  body: PostSandboxFunctionInvocationRequestBody;
};

/**
 * Invoke a function of the share's Frame as an anonymous caller, and wait briefly for the
 * outcome. An invocation still running after the wait comes back with a result token for its event
 * stream.
 */
export async function invokePublicFrameFunction(
  { auth, frame }: PublicFrameShare,
  { sandboxFunction, body }: InvokePublicFrameFunctionInput
): Promise<Result<PostPublicFrameFunctionInvocationResponseBody, Error>> {
  const invocationResult = await sandboxFunction.invoke(auth, body, {
    origin: "anonymous",
  });
  if (invocationResult.isErr()) {
    return invocationResult;
  }

  const invocation = invocationResult.value;
  const outcome =
    invocation.settledOutcome() ??
    (await awaitSandboxFunctionInvocationOutcome({
      invocationId: invocation.sId,
    }));
  if (outcome) {
    return new Ok({
      invocation: invocation.toJSON(),
      outcome: sanitizePublicOutcome(outcome),
    });
  }

  return new Ok({
    invocation: invocation.toJSON(),
    resultToken: await mintPublicInvocationResultToken({
      frameId: frame.sId,
      invocationId: invocation.sId,
    }),
  });
}

type CheckPublicInvocationResultTokenInput = {
  invocationId: string;
  resultToken: string;
};

/**
 * @cc [owner:achilleburah,label:security] public-invocation-results-need-capability
 * True MUST be returned only for a result token minted by `invokePublicFrameFunction` for that
 * invocation of the share's Frame, less than 15 minutes ago. The token is matched through its
 * SHA-256, and the raw token MUST NOT be stored.
 */
export async function checkPublicInvocationResultToken(
  { frame }: PublicFrameShare,
  { invocationId, resultToken }: CheckPublicInvocationResultTokenInput
): Promise<boolean> {
  const rawRecord = await runOnRedis(
    { origin: "public_frame_invocation_results" },
    (redis) =>
      redis.get(publicInvocationResultKey(hashResultToken(resultToken)))
  );
  if (!rawRecord) {
    return false;
  }
  const json = safeParseJSON(rawRecord);
  if (json.isErr()) {
    return false;
  }
  const record = PublicInvocationResultRecordSchema.safeParse(json.value);
  return (
    record.success &&
    record.data.frameId === frame.sId &&
    record.data.invocationId === invocationId
  );
}
