import { getDocumentComments } from "@app/components/editor/document/DocumentComments";
import type { DocumentImageOptions } from "@app/components/editor/document/DocumentImage";
import type { Translate } from "@app/components/editor/document/extensions";
import { buildDocumentEditorExtensions } from "@app/components/editor/document/extensions";
import type { LiveCommentChannel } from "@app/lib/client/live_comments";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { BODY_FRAGMENT_NAME } from "@app/types/collab";
import type { AnyExtension } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import isEqual from "lodash/isEqual";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";

/** Who a live editor's caret belongs to, as other editors draw it. */
export interface DocumentLiveUser {
  name: string;
  color: string;
}

const liveCommentThreads = (channel: LiveCommentChannel) => {
  // Shared by every editor built from these extensions: one mounting once the channel has closed
  // still shows what the session last sent.
  let lastShown: DfmComment[] | null = null;
  return Extension.create<
    Record<string, never>,
    { unsubscribe: (() => void) | null }
  >({
    name: "liveCommentThreads",
    addStorage: () => ({ unsubscribe: null }),
    onBeforeCreate() {
      // The session echoes every command, so most messages carry the threads already shown, and
      // a command dispatches even when it changes nothing.
      const show = (comments: DfmComment[]) => {
        lastShown = comments;
        if (
          !this.editor.isDestroyed &&
          !isEqual(getDocumentComments(this.editor.state.doc), comments)
        ) {
          this.editor.commands.setCommentThreads(comments);
        }
      };
      // Not on `create`, which TipTap emits a tick after mounting: the file's threads would show
      // until then.
      this.editor.on("mount", () => {
        const current = channel.getThreads() ?? lastShown;
        if (current) {
          show(current);
        }
      });
      this.storage.unsubscribe = channel.onThreads(show);
    },
    onDestroy() {
      this.storage.unsubscribe?.();
    },
  });
};

/**
 * @cc [owner:PopDaph,label:product] document-live-extensions
 * A live document MUST use the same schema as `documentExtensions`, bind its body to the
 * `BODY_FRAGMENT_NAME` fragment of the shared document, and replace StarterKit's undo history
 * with the collaboration one, so undo reverts only the local user's own changes. A comment mark
 * whose thread the editor lacks MUST be kept, its edges protected and text inserted inside it
 * marked, as for a comment with a thread.
 */
/**
 * @cc [owner:tdraier,label:product] document-live-threads
 * A live document's threads MUST be the ones the session last sent, from the moment the editor
 * mounts, including an editor mounting once the channel has closed. They MUST be replaced whole
 * on each message, keeping every comment mark, outside undo history. Until the first one, they
 * MUST be the threads the channel was created with, or as loaded from the file when it has none.
 */
export const buildLiveDocumentExtensions = ({
  t,
  document,
  awareness,
  user,
  comments,
  resolveImageSource,
}: {
  t: Translate;
  document: Y.Doc;
  awareness: Awareness | null;
  user: DocumentLiveUser;
  comments: LiveCommentChannel;
  resolveImageSource: DocumentImageOptions["resolveSource"];
}): AnyExtension[] => [
  ...buildDocumentEditorExtensions(t, { live: true, resolveImageSource }),
  liveCommentThreads(comments),
  Collaboration.configure({ document, field: BODY_FRAGMENT_NAME }),
  ...(awareness
    ? [CollaborationCaret.configure({ provider: { awareness }, user })]
    : []),
];
