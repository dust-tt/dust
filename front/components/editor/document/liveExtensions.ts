import { buildDocumentEditorExtensions } from "@app/components/editor/document/extensions";
import { BODY_FRAGMENT_NAME } from "@app/types/collab";
import type { MessageDescriptor } from "@lingui/core";
import type { AnyExtension } from "@tiptap/core";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";

/** Who a live editor's caret belongs to, as other editors draw it. */
export interface DocumentLiveUser {
  name: string;
  color: string;
}

/**
 * @cc [owner:PopDaph,label:product] document-live-extensions
 * A live document MUST use the same schema as `documentExtensions`, bind its body to the
 * `BODY_FRAGMENT_NAME` fragment of the shared document, and replace StarterKit's undo history
 * with the collaboration one, so undo reverts only the local user's own changes. It MUST NOT
 * remove comment marks whose thread the editor lacks.
 */
export const buildLiveDocumentExtensions = ({
  t,
  document,
  awareness,
  user,
}: {
  t: (descriptor: MessageDescriptor) => string;
  document: Y.Doc;
  awareness: Awareness | null;
  user: DocumentLiveUser;
}): AnyExtension[] => [
  ...buildDocumentEditorExtensions(t, { live: true }),
  Collaboration.configure({ document, field: BODY_FRAGMENT_NAME }),
  ...(awareness
    ? [CollaborationCaret.configure({ provider: { awareness }, user })]
    : []),
];
