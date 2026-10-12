import {
  fetchLiveSource,
  pushLiveSource,
} from "@app/lib/api/collab/live_source";
import type { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { Authenticator } from "@app/lib/auth";
import type { LiveAgent } from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

const MAX_LIVE_SESSION_WRITE_ATTEMPTS = 3;

export type LiveSessionWriteErrorCode =
  | "read_only"
  | "refused"
  | "conflict"
  | "unavailable";

export class LiveSessionWriteError extends Error {
  constructor(
    readonly code: LiveSessionWriteErrorCode,
    message: string
  ) {
    super(message);
  }
}

export function isLiveSessionWriteError(
  error: unknown
): error is LiveSessionWriteError {
  return error instanceof LiveSessionWriteError;
}

export type LiveSessionWrite<T> =
  | { kind: "no_session" }
  | { kind: "written"; value: T };

/**
 * @cc [owner:PopDaph,label:product;concurrency;security] live-session-write
 * Every write of a file through its live session MUST go through this function. While a session
 * holds `filePath`, `dustFs` MUST be able to write it, else `read_only`; `change` MUST receive the
 * session's source and its result MUST be pushed conditional on that source, starting over from a
 * fresh read when the session changed or was busy, and failing with `conflict` after
 * `MAX_LIVE_SESSION_WRITE_ATTEMPTS`. Without a session, or once it closed, it MUST write nothing and
 * answer `no_session`, so the caller writes the file. Failing to learn whether a session is open
 * MUST be an error, never `no_session`, since the caller would then write the file under an open
 * session. `filePath` MUST be the normalized path without a trailing slash, the only one a live
 * document is named after (`live-file-access`). With `agent`, the session's editors see the
 * reads and the edit as that agent's.
 *
 * Known gap until the per-file lock of LIVE_SESSION.md: a session opening between the check and
 * the caller's file write misses the write, and its checkpoints conflict with it.
 */
export async function writeThroughLiveSession<T, E extends Error>(
  auth: Authenticator,
  dustFs: DustFileSystem,
  {
    filePath,
    change,
    agent,
  }: {
    filePath: string;
    change: (
      source: string
    ) => Promise<Result<{ source: string; value: T }, E>>;
    agent?: LiveAgent;
  }
): Promise<Result<LiveSessionWrite<T>, LiveSessionWriteError | E>> {
  for (let attempt = 0; attempt < MAX_LIVE_SESSION_WRITE_ATTEMPTS; attempt++) {
    const live = await fetchLiveSource(auth, filePath, agent);
    if (live.isErr()) {
      return new Err(
        new LiveSessionWriteError(live.error.code, live.error.message)
      );
    }
    if (!live.value.open) {
      return new Ok({ kind: "no_session" });
    }
    const writable = dustFs.checkWriteAccess(filePath);
    if (writable.isErr()) {
      return new Err(
        new LiveSessionWriteError("read_only", writable.error.message)
      );
    }
    const changed = await change(live.value.source);
    if (changed.isErr()) {
      return changed;
    }

    const pushed = await pushLiveSource(auth, {
      canonicalPath: filePath,
      base: live.value.source,
      source: changed.value.source,
      agent,
    });
    if (pushed.isErr()) {
      return new Err(
        new LiveSessionWriteError(pushed.error.code, pushed.error.message)
      );
    }
    switch (pushed.value) {
      case "written":
        return new Ok({ kind: "written", value: changed.value.value });
      case "closed":
        return new Ok({ kind: "no_session" });
      case "changed":
      case "busy":
        continue;
      default:
        assertNever(pushed.value);
    }
  }

  return new Err(
    new LiveSessionWriteError(
      "conflict",
      "The file kept changing in its live session. Read it again and retry."
    )
  );
}
