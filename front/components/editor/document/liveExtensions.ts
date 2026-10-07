import type { Translate } from "@app/components/editor/document/extensions";
import { buildDocumentEditorExtensions } from "@app/components/editor/document/extensions";
import type { LiveCommentChannel } from "@app/lib/client/live_comments";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { BODY_FRAGMENT_NAME } from "@app/types/collab";
import type { AnyExtension } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";

/** Who a live editor's caret belongs to, as other editors draw it. */
export interface DocumentLiveUser {
  name: string;
  color: string;
}

const liveCommentThreads = (channel: LiveCommentChannel) =>
  Extension.create<
    Record<string, never>,
    { unsubscribe: (() => void) | null }
  >({
    name: "liveCommentThreads",
    addStorage: () => ({ unsubscribe: null }),
    onBeforeCreate() {
      const show = (comments: DfmComment[]) => {
        if (!this.editor.isDestroyed) {
          this.editor.commands.setCommentThreads(comments);
        }
      };
      // Not on `create`, which TipTap emits a tick after mounting: the file's threads would show
      // until then.
      this.editor.on("mount", () => {
        const current = channel.getThreads();
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
 * mounts, replaced whole on each message, outside undo history, and MUST stay as loaded from the
 * file until the first one.
 */
export const buildLiveDocumentExtensions = ({
  t,
  document,
  awareness,
  user,
  comments,
}: {
  t: Translate;
  document: Y.Doc;
  awareness: Awareness | null;
  user: DocumentLiveUser;
  comments: LiveCommentChannel;
}): AnyExtension[] => [
  ...buildDocumentEditorExtensions(t, { live: true }),
  liveCommentThreads(comments),
  Collaboration.configure({ document, field: BODY_FRAGMENT_NAME }),
  ...(awareness
    ? [CollaborationCaret.configure({ provider: { awareness }, user })]
    : []),
];
