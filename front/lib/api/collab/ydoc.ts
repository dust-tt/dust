import { documentSchema } from "@app/components/editor/document/content";
import type { DfmEnvelope } from "@app/components/editor/document/dfm_persistence";
import {
  loadDfm,
  saveDfm,
} from "@app/components/editor/document/dfm_persistence";
import {
  COMMENT_MARK_NAME,
  getDocumentJSONComments,
  withDocumentJSONComments,
  withoutDocumentJSONComments,
} from "@app/components/editor/document/DocumentComments";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { BODY_FRAGMENT_NAME } from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { JSONContent } from "@tiptap/core";
import {
  prosemirrorJSONToYXmlFragment,
  updateYFragment,
  yXmlFragmentToProsemirrorJSON,
} from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { z } from "zod";

/** What the editor content does not carry: front matter and anchor order. */
export const ENVELOPE_MAP_NAME = "envelope";

const envelopeSchema = z.object({
  frontMatter: z.string().nullable(),
  anchorOrder: z.array(z.string()),
}) satisfies z.ZodType<DfmEnvelope>;

/** A file as the live session holds it: the shared document, and the threads kept beside it. */
export interface LiveDocument {
  doc: Y.Doc;
  comments: DfmComment[];
}

/**
 * @cc [owner:PopDaph,label:product] co-edition-ydoc-round-trip
 * `yDocToDfm(dfmToYDoc(source))` MUST return what `saveDfm` returns for the same file loaded
 * with `loadDfm`, and `dfmToYDoc` MUST refuse a file `loadDfm` refuses, with the same reason.
 */
/**
 * @cc [owner:PopDaph,label:architecture;security] co-edition-threads-outside-ydoc
 * Comment threads MUST NOT be stored in the `Y.Doc`: they travel in `comments`, so a browser
 * update to the shared document can never write a thread or change its author.
 */
export function dfmToYDoc(source: string): Result<LiveDocument, string> {
  const loaded = loadDfm(source);
  if (loaded.isErr()) {
    return loaded;
  }
  const { envelope, content } = loaded.value;

  const doc = new Y.Doc();
  prosemirrorJSONToYXmlFragment(
    documentSchema,
    withoutDocumentJSONComments(content),
    doc.getXmlFragment(BODY_FRAGMENT_NAME)
  );
  const map = doc.getMap(ENVELOPE_MAP_NAME);
  map.set("frontMatter", envelope.frontMatter);
  map.set("anchorOrder", envelope.anchorOrder);
  return new Ok({ doc, comments: getDocumentJSONComments(content) });
}

/**
 * @cc [owner:tdraier,label:product;concurrency] co-edition-ydoc-replace
 * `replaceYDocContent` MUST change `doc` so that `yDocToDfm`, with the threads it returns, gives
 * what it gives for `dfmToYDoc(source)`, in one transaction with `origin`, leaving what is equal
 * in place so the people editing keep their cursors. It MUST refuse a file `loadDfm` refuses, with
 * the same reason, without changing `doc`.
 */
export function replaceYDocContent(
  doc: Y.Doc,
  source: string,
  origin: unknown
): Result<DfmComment[], string> {
  const loaded = loadDfm(source);
  if (loaded.isErr()) {
    return loaded;
  }
  const { envelope, content } = loaded.value;

  const body = documentSchema.nodeFromJSON(
    withoutDocumentJSONComments(content)
  );
  doc.transact(() => {
    updateYFragment(doc, doc.getXmlFragment(BODY_FRAGMENT_NAME), body, {
      mapping: new Map(),
      isOMark: new Map(),
    });
    // Setting an unchanged value would still send an update to every editor.
    const map = doc.getMap(ENVELOPE_MAP_NAME);
    if (map.get("frontMatter") !== envelope.frontMatter) {
      map.set("frontMatter", envelope.frontMatter);
    }
    if (
      JSON.stringify(map.get("anchorOrder")) !==
      JSON.stringify(envelope.anchorOrder)
    ) {
      map.set("anchorOrder", envelope.anchorOrder);
    }
  }, origin);
  return new Ok(getDocumentJSONComments(content));
}

const withoutOrphanAnchors = (
  content: JSONContent,
  threadIds: Set<string>
): JSONContent => {
  const { marks, content: children, ...node } = content;
  const kept = marks?.filter(
    (mark) =>
      mark.type !== COMMENT_MARK_NAME || threadIds.has(String(mark.attrs?.id))
  );
  return {
    ...node,
    ...(kept && kept.length > 0 && { marks: kept }),
    ...(children && {
      content: children.map((child) => withoutOrphanAnchors(child, threadIds)),
    }),
  };
};

/**
 * @cc [owner:tdraier,label:product] co-edition-orphan-anchors-dropped
 * `yDocToDfm` MUST write without the comment marks whose id has no thread in `comments`, so a
 * mark left without its thread, by an undo or a failed comment command, never blocks a save.
 */
export function yDocToDfm({
  doc,
  comments,
}: LiveDocument): Result<string, string> {
  const envelope = envelopeSchema.safeParse(
    doc.getMap(ENVELOPE_MAP_NAME).toJSON()
  );
  if (!envelope.success) {
    return new Err("The live document has no valid envelope.");
  }

  // A client can send structures the binding cannot read back.
  let content: JSONContent;
  try {
    content = yXmlFragmentToProsemirrorJSON(
      doc.getXmlFragment(BODY_FRAGMENT_NAME)
    );
  } catch {
    return new Err("The live document has an unreadable body.");
  }
  const threadIds = new Set(comments.map(({ id }) => id));
  return saveDfm(
    envelope.data,
    withDocumentJSONComments(withoutOrphanAnchors(content, threadIds), comments)
  );
}
