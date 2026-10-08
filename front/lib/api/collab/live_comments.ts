import type { LiveFile } from "@app/lib/api/collab/live_file";
import { yDocCommentedTexts } from "@app/lib/api/collab/ydoc";
import { dispatchCommentMentions } from "@app/lib/api/files/dfm_comment_mentions";
import { signDfmCommentMessage } from "@app/lib/api/files/dfm_comment_signatures";
import type { DfmCommentSignatureError } from "@app/lib/api/files/dfm_comment_signatures";
import type { DfmComment, DfmMessage } from "@app/lib/markdown/dfm";
import { extractFromString } from "@app/lib/mentions/format";
import type {
  LiveCommentCommand,
  LiveCommentErrorCode,
} from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type * as Y from "yjs";

const signatureRefusal = ({
  code,
}: DfmCommentSignatureError): LiveCommentErrorCode =>
  code === "unwritable_message" ? "unwritable" : "unavailable";

/**
 * @cc [owner:tdraier,label:security;product] live-comment-commands
 * A command MUST be refused as `unavailable` when `file` cannot write. `add` and `reply` MUST
 * store the message `signDfmCommentMessage` writes for `file`'s user and path after the thread's
 * last message, never a message, author or time from the command, and return it as `added`, which
 * other commands MUST leave null; when it refuses, the command MUST be refused as `unwritable` if
 * the codec cannot write the message, otherwise as `unavailable`. `add` MUST be refused as
 * `unavailable` for an id that already has a thread; `reply`, `resolve` and `delete` as
 * `not_found` for one that has none; `reply` as `thread_changed` unless its position is the
 * thread's length. A refused command MUST leave the threads unchanged; an accepted one MUST change
 * only its own thread.
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
    {
      comments: DfmComment[];
      created: DfmComment | null;
      added: DfmMessage | null;
    },
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
      return new Ok({
        comments: [...comments, created],
        created,
        added: signed.value,
      });
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
        added: signed.value,
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
        added: null,
      });
    case "delete":
      if (!thread) {
        return new Err("not_found");
      }
      return new Ok({ comments: replace(null), created: null, added: null });
    default:
      assertNever(command);
  }
}

/**
 * @cc [owner:tdraier,label:product] live-comment-mentions
 * `message`, the one `applyLiveCommentCommand` stored for an accepted `command`, MUST be handed
 * to `dispatchCommentMentions` for `file`'s user and path, as a save of the file would. Its quote
 * MUST be the one an `add` carries, as the browser anchors its thread only once it is accepted,
 * and for a `reply` the text its thread's anchors cover in `doc` as `yDocCommentedTexts` gives
 * it, so agents get the editor's text either way, and none only when the body cannot be read. A
 * message without mentions MUST NOT read `doc`, as that converts the whole document.
 */
export async function dispatchLiveCommentMentions(
  file: LiveFile,
  doc: Y.Doc,
  command: LiveCommentCommand,
  message: DfmMessage
): Promise<void> {
  if (extractFromString(message.body).length === 0) {
    return;
  }
  const quote =
    command.type === "add"
      ? (command.quote ?? null)
      : (yDocCommentedTexts(doc).get(command.commentId) ?? null);
  await dispatchCommentMentions(file.auth, {
    scopedPath: file.canonicalPath,
    newMessages: [{ commentId: command.commentId, quote, message }],
  });
}
