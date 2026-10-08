import type { LiveFile } from "@app/lib/api/collab/live_file";
import type { LiveDocument } from "@app/lib/api/collab/ydoc";
import { yDocToDfm } from "@app/lib/api/collab/ydoc";
import { dispatchCommentMentions } from "@app/lib/api/files/dfm_comment_mentions";
import {
  commentQuotes,
  signDfmCommentMessage,
} from "@app/lib/api/files/dfm_comment_signatures";
import type { DfmCommentSignatureError } from "@app/lib/api/files/dfm_comment_signatures";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { parseDfm } from "@app/lib/markdown/dfm";
import type {
  LiveCommentCommand,
  LiveCommentErrorCode,
} from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

const signatureRefusal = ({
  code,
}: DfmCommentSignatureError): LiveCommentErrorCode =>
  code === "unwritable_message" ? "unwritable" : "unavailable";

/**
 * @cc [owner:tdraier,label:security;product] live-comment-commands
 * A command MUST be refused as `unavailable` when `file` cannot write. `add` and `reply` MUST
 * store the message `signDfmCommentMessage` writes for `file`'s user and path after the thread's
 * last message, never a message, author or time from the command; when it refuses, the command
 * MUST be refused as `unwritable` if the codec cannot write the message, otherwise as
 * `unavailable`. `add` MUST be refused as `unavailable` for an id that already has
 * a thread; `reply`, `resolve` and `delete` as `not_found` for one that has none; `reply` as
 * `thread_changed` unless its position is the thread's length. A refused command MUST leave the
 * threads unchanged; an accepted one MUST change only its own thread.
 *
 * Callers MUST apply a session's commands one at a time, each to the threads the previous one
 * left: the result is built from `comments` across an await, so overlapping calls would drop one.
 */
export async function applyLiveCommentCommand(
  file: LiveFile,
  comments: DfmComment[],
  command: LiveCommentCommand
): Promise<
  Result<
    { comments: DfmComment[]; created: DfmComment | null },
    LiveCommentErrorCode
  >
> {
  if (!file.canWrite) {
    return new Err("unavailable");
  }
  const thread = comments.find(({ id }) => id === command.commentId);
  const replace = (next: DfmComment | null) =>
    comments.flatMap((comment) =>
      comment.id !== command.commentId ? [comment] : next ? [next] : []
    );

  switch (command.type) {
    case "add": {
      if (thread) {
        return new Err("unavailable");
      }
      const signed = await signDfmCommentMessage(file.auth, {
        filePath: file.canonicalPath,
        commentId: command.commentId,
        position: 0,
        previous: null,
        body: command.body,
      });
      if (signed.isErr()) {
        return new Err(signatureRefusal(signed.error));
      }
      const created: DfmComment = {
        id: command.commentId,
        status: "open",
        messages: [signed.value],
      };
      return new Ok({ comments: [...comments, created], created });
    }
    case "reply": {
      if (!thread) {
        return new Err("not_found");
      }
      if (command.position !== thread.messages.length) {
        return new Err("thread_changed");
      }
      const signed = await signDfmCommentMessage(file.auth, {
        filePath: file.canonicalPath,
        commentId: thread.id,
        position: command.position,
        previous: thread.messages[command.position - 1],
        body: command.body,
      });
      if (signed.isErr()) {
        return new Err(signatureRefusal(signed.error));
      }
      return new Ok({
        comments: replace({
          ...thread,
          messages: [...thread.messages, signed.value],
        }),
        created: null,
      });
    }
    case "resolve":
      if (!thread) {
        return new Err("not_found");
      }
      return new Ok({
        comments: replace({
          ...thread,
          status: command.resolved ? "resolved" : "open",
        }),
        created: null,
      });
    case "delete":
      if (!thread) {
        return new Err("not_found");
      }
      return new Ok({ comments: replace(null), created: null });
    default:
      assertNever(command);
  }
}

/** The text the thread's anchors cover in the live document, if it is anchored. */
function liveQuote(live: LiveDocument, commentId: string): string | null {
  const source = yDocToDfm(live);
  if (source.isErr()) {
    return null;
  }
  const document = parseDfm(source.value);
  return document.isOk()
    ? (commentQuotes(document.value.body).get(commentId) ?? null)
    : null;
}

/**
 * @cc [owner:tdraier,label:product] live-comment-mentions
 * Once an `add` or a `reply` is accepted, the message it added, the thread's last in `live`, MUST
 * be handed to `dispatchCommentMentions` for `file`'s user and path, as a save of the file would,
 * with as quote the text the thread's anchors cover in `live`, or the quote the `add` carries
 * while its thread is not anchored yet. Other commands MUST NOT dispatch anything.
 */
export async function dispatchLiveCommentMentions(
  file: LiveFile,
  live: LiveDocument,
  command: LiveCommentCommand
): Promise<void> {
  if (command.type !== "add" && command.type !== "reply") {
    return;
  }
  const message = live.comments
    .find(({ id }) => id === command.commentId)
    ?.messages.at(-1);
  if (!message) {
    return;
  }
  const quote =
    liveQuote(live, command.commentId) ??
    (command.type === "add" ? (command.quote ?? null) : null);
  await dispatchCommentMentions(file.auth, {
    scopedPath: file.canonicalPath,
    newMessages: [{ commentId: command.commentId, quote, message }],
  });
}
