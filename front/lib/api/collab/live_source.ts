import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type {
  LiveAgent,
  LiveSourceReadRequest,
  LiveSourceReadResponse,
  LiveSourceWriteRequest,
  LiveSourceWriteResult,
} from "@app/types/collab";
import {
  COLLAB_INTERNAL_ROUTES_PREFIX,
  LIVE_SOURCE_READ_PATH,
  LIVE_SOURCE_WRITE_PATH,
  LIVE_SOURCE_WRITE_WAIT_MS,
  liveSourceReadResponseSchema,
  liveSourceWriteResponseSchema,
} from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

// Long enough for the collab server to answer a write that waited its whole turn.
const LIVE_SOURCE_TIMEOUT_MS = 2 * LIVE_SOURCE_WRITE_WAIT_MS;

const apiErrorSchema = z.object({
  error: z.object({ type: z.string(), message: z.string() }),
});

/** Why a live document could not be read or written: refused, or the collab server failed. */
export interface LiveSourceError {
  code: "refused" | "unavailable";
  message: string;
}

const unavailable = (message: string): LiveSourceError => ({
  code: "unavailable",
  message,
});

function isConnectionRefused(err: unknown): boolean {
  if (!(err instanceof TypeError) || !(err.cause instanceof Error)) {
    return false;
  }
  return "code" in err.cause && err.cause.code === "ECONNREFUSED";
}

// A 401 only answers a wrong secret: a misconfiguration, not a refusal of this request.
const isRefusal = (status: number) =>
  status >= 400 && status < 500 && status !== 401;

/** The collab server's answer, or `null` when nothing listens: no session can then be open. */
async function postToCollabServer<S extends z.ZodTypeAny>(
  path: string,
  body: LiveSourceReadRequest | LiveSourceWriteRequest,
  schema: S
): Promise<Result<z.infer<S> | null, LiveSourceError>> {
  const url = config.getCollabServerInternalUrl();
  const secret = config.getCollabServerInternalSecret();
  if (!url || !secret) {
    return new Ok(null);
  }

  let response: Response;
  try {
    response = await fetch(`${url}${COLLAB_INTERNAL_ROUTES_PREFIX}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LIVE_SOURCE_TIMEOUT_MS),
    });
  } catch (err) {
    if (isConnectionRefused(err)) {
      return new Ok(null);
    }
    return new Err(unavailable(normalizeError(err).message));
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = apiErrorSchema.safeParse(json);
    return new Err({
      code: isRefusal(response.status) ? "refused" : "unavailable",
      message: failure.success
        ? failure.data.error.message
        : `Collab server error (${response.status}).`,
    });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return new Err(unavailable("Unexpected collab server answer."));
  }
  return new Ok(parsed.data);
}

/**
 * @cc [owner:tdraier,label:product;concurrency] live-source-read
 * A document MUST be reported closed without asking the collab server only when no collab server is
 * configured, and when nothing listens at its address: no session can be open then, since the
 * collab server refuses to start without its internal secret. It MUST be asked whatever the
 * workspace's `co_edition`, since a session can outlive the flag being turned off. It MUST be asked
 * as `auth`'s user when it has one, since an open document's source is only served to a user who
 * can open it live; a refusal MUST be `refused`. Any other failure MUST be an error, never reported
 * closed, since the caller would write the file under an open session. With `agent`, the session
 * shows that agent reading the document to its editors.
 */
export async function fetchLiveSource(
  auth: Authenticator,
  canonicalPath: string,
  agent?: LiveAgent
): Promise<Result<LiveSourceReadResponse, LiveSourceError>> {
  const answer = await postToCollabServer(
    LIVE_SOURCE_READ_PATH,
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
      userId: auth.user()?.sId,
      canonicalPath,
      agent,
    },
    liveSourceReadResponseSchema
  );
  if (answer.isErr()) {
    return answer;
  }
  return new Ok(answer.value ?? { open: false });
}

/**
 * @cc [owner:tdraier,label:product;concurrency;security] live-source-write
 * The write MUST be sent as `auth`'s user, conditional on `base`, and MUST be refused without
 * asking the collab server when `auth` has no user. Nothing listening at the collab server's
 * address MUST count as `closed`. A refusal of the access or of the source MUST be `refused`, any
 * other failure `unavailable`: the collab server refuses an access with a 4xx other than 401,
 * which only answers a wrong secret. With `agent`, the session's editors see the change as that
 * agent's edit.
 */
export async function pushLiveSource(
  auth: Authenticator,
  {
    canonicalPath,
    base,
    source,
    agent,
  }: {
    canonicalPath: string;
    base: string;
    source: string;
    agent?: LiveAgent;
  }
): Promise<Result<LiveSourceWriteResult, LiveSourceError>> {
  const user = auth.user();
  if (!user) {
    return new Err({
      code: "refused",
      message:
        "This document is being edited live and can only be changed on behalf of a user.",
    });
  }
  const answer = await postToCollabServer(
    LIVE_SOURCE_WRITE_PATH,
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
      userId: user.sId,
      canonicalPath,
      base,
      source,
      agent,
    },
    liveSourceWriteResponseSchema
  );
  if (answer.isErr()) {
    return answer;
  }
  if (answer.value === null) {
    return new Ok("closed");
  }
  if (answer.value.result === "refused") {
    return new Err({ code: "refused", message: answer.value.message });
  }
  return new Ok(answer.value.result);
}
