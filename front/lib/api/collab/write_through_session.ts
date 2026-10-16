import {
  readCollabSource,
  writeCollabSource,
} from "@app/lib/api/collab/client";
import type { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { Authenticator } from "@app/lib/auth";
import type { CollabAgent } from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

const MAX_SESSION_WRITE_ATTEMPTS = 3;

export type CollabSessionWriteErrorCode =
  | "read_only"
  | "refused"
  | "conflict"
  | "unavailable";

export class CollabSessionWriteError extends Error {
  constructor(
    readonly code: CollabSessionWriteErrorCode,
    message: string
  ) {
    super(message);
  }
}

export function isCollabSessionWriteError(
  error: unknown
): error is CollabSessionWriteError {
  return error instanceof CollabSessionWriteError;
}

export type CollabSessionWrite<T> =
  | { kind: "no_session" }
  | { kind: "written"; value: T };

/**
 * @cc [owner:PopDaph,label:product;concurrency;security] collab-session-write
 * Every write of a file through its live session MUST go through this function. While a session
 * holds `filePath`, `dustFs` MUST be able to write it, else `read_only`; `change` MUST receive the
 * session's source and its result MUST be pushed conditional on that source, starting over from a
 * fresh read when the session changed or was busy, and failing with `conflict` after
 * `MAX_SESSION_WRITE_ATTEMPTS`, or at once with `unavailable` when the session cannot save
 * (`unsaved`). Without a session, or once it closed, it MUST write nothing and
 * answer `no_session`, so the caller writes the file. Failing to learn whether a session is open
 * MUST be an error, never `no_session`, since the caller would then write the file under an open
 * session. `filePath` MUST be the normalized path without a trailing slash, the only one a live
 * document is named after (`collab-access-open`). With `agent`, the session's editors see the
 * reads and the edit as that agent's.
 *
 * Known gap until the per-file lock of LIVE_SESSION.md: a session opening between the check and
 * the caller's file write misses the write, and its checkpoints conflict with it.
 */
export async function writeThroughCollabSession<T, E extends Error>(
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
    agent?: CollabAgent;
  }
): Promise<Result<CollabSessionWrite<T>, CollabSessionWriteError | E>> {
  for (let attempt = 0; attempt < MAX_SESSION_WRITE_ATTEMPTS; attempt++) {
    const live = await readCollabSource(auth, filePath, agent);
    if (live.isErr()) {
      return new Err(
        new CollabSessionWriteError(live.error.code, live.error.message)
      );
    }
    if (!live.value.open) {
      return new Ok({ kind: "no_session" });
    }
    const writable = dustFs.checkWriteAccess(filePath);
    if (writable.isErr()) {
      return new Err(
        new CollabSessionWriteError("read_only", writable.error.message)
      );
    }
    const changed = await change(live.value.source);
    if (changed.isErr()) {
      return changed;
    }

    const pushed = await writeCollabSource(auth, {
      canonicalPath: filePath,
      base: live.value.source,
      source: changed.value.source,
      agent,
    });
    if (pushed.isErr()) {
      return new Err(
        new CollabSessionWriteError(pushed.error.code, pushed.error.message)
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
      case "unsaved":
        return new Err(
          new CollabSessionWriteError(
            "unavailable",
            "This file's live session cannot save it right now, so it takes no changes. Try again later."
          )
        );
      default:
        assertNever(pushed.value);
    }
  }

  return new Err(
    new CollabSessionWriteError(
      "conflict",
      "The file kept changing in its live session. Read it again and retry."
    )
  );
}
