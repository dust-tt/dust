// @vitest-environment node
import {
  loadDfm,
  saveDfm,
} from "@app/components/editor/document/dfm_persistence";
import { describeDocumentError } from "@app/components/editor/document/errors";
import {
  dfmToYDoc,
  ENVELOPE_MAP_NAME,
  yDocToDfm,
} from "@app/lib/api/collab/ydoc";
import { FIXTURE, FIXTURES } from "@app/lib/markdown/dfm/tests/dfm.test_utils";
import { BODY_FRAGMENT_NAME } from "@app/types/collab";
import { Err } from "@app/types/shared/result";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

const savedByEditor = (source: string) => {
  const loaded = loadDfm(source);
  if (loaded.isErr()) {
    throw new Error(describeDocumentError(loaded.error));
  }
  const saved = saveDfm(loaded.value.envelope, loaded.value.content);
  return saved.isErr() ? new Err(describeDocumentError(saved.error)) : saved;
};

describe("dfmToYDoc and yDocToDfm", () => {
  it.each(FIXTURES)("write $name back as the editor does", ({ source }) => {
    const live = dfmToYDoc(source);
    expect(live.isOk()).toBe(true);
    if (live.isOk()) {
      expect(yDocToDfm(live.value)).toEqual(savedByEditor(source));
    }
  });

  it("keep front matter", () => {
    const source = "---\ntitle: x\n---\n\n# Title\n\nSome **bold** text.\n";
    const live = dfmToYDoc(source);
    expect(live.isOk()).toBe(true);
    if (live.isOk()) {
      expect(yDocToDfm(live.value)).toEqual(savedByEditor(source));
    }
  });

  it("keep threads out of the shared document", () => {
    const live = dfmToYDoc(FIXTURE);
    expect(live.isOk()).toBe(true);
    if (!live.isOk()) {
      return;
    }

    expect(live.value.comments.length).toBeGreaterThan(0);
    expect([...live.value.doc.share.keys()].sort()).toEqual([
      BODY_FRAGMENT_NAME,
      ENVELOPE_MAP_NAME,
    ]);
    expect(
      Object.keys(live.value.doc.getMap(ENVELOPE_MAP_NAME).toJSON()).sort()
    ).toEqual(["anchorOrder", "frontMatter"]);
  });

  it("survive a copy of the shared document through a Yjs update", () => {
    const live = dfmToYDoc(FIXTURE);
    expect(live.isOk()).toBe(true);
    if (!live.isOk()) {
      return;
    }

    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(live.value.doc));

    expect(yDocToDfm({ doc: copy, comments: live.value.comments })).toEqual(
      savedByEditor(FIXTURE)
    );
  });

  it("write the edits and threads the session holds, never threads from the shared document", () => {
    const live = dfmToYDoc(FIXTURE);
    expect(live.isOk()).toBe(true);
    if (!live.isOk()) {
      return;
    }
    const { doc, comments } = live.value;

    // A remote client edits the text and the front matter, and forges a thread.
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    const paragraph = remote
      .getXmlFragment(BODY_FRAGMENT_NAME)
      .toArray()
      .find(
        (node): node is Y.XmlElement =>
          node instanceof Y.XmlElement && node.nodeName === "paragraph"
      );
    const text = paragraph?.toArray().find((node) => node instanceof Y.XmlText);
    expect(text).toBeInstanceOf(Y.XmlText);
    if (!(text instanceof Y.XmlText)) {
      return;
    }
    text.insert(0, "Edited remotely. ");
    remote.getMap(ENVELOPE_MAP_NAME).set("frontMatter", "title: remote");
    remote.getMap(ENVELOPE_MAP_NAME).set("comments", [{ id: "forged" }]);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(doc)));

    const saved = yDocToDfm({ doc, comments });
    expect(saved.isOk()).toBe(true);
    if (!saved.isOk()) {
      return;
    }
    expect(saved.value.startsWith("---\ntitle: remote\n---")).toBe(true);
    expect(saved.value).toContain("Edited remotely. ");
    expect(saved.value).not.toContain("forged");
  });

  it("refuse a body the binding cannot read", () => {
    const live = dfmToYDoc(FIXTURE);
    expect(live.isOk()).toBe(true);
    if (!live.isOk()) {
      return;
    }

    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(live.value.doc));
    // The typings forbid this shape, but a client can send it.
    remote.getXmlFragment(BODY_FRAGMENT_NAME).insert(0, [new Y.Map()] as never);
    Y.applyUpdate(
      live.value.doc,
      Y.encodeStateAsUpdate(remote, Y.encodeStateVector(live.value.doc))
    );

    expect(yDocToDfm(live.value).isErr()).toBe(true);
  });

  it("refuse a file the editor refuses, with the same reason", () => {
    const table = "| a | b |\n|---|---|\n| 1 | 2 |\n";
    const editor = loadDfm(table);
    const live = dfmToYDoc(table);

    expect(editor.isErr()).toBe(true);
    expect(live.isErr()).toBe(true);
    if (live.isErr() && editor.isErr()) {
      expect(live.error).toBe(describeDocumentError(editor.error));
    }
  });

  it("refuse a shared document with no envelope", () => {
    const doc = new Y.Doc();
    doc.getXmlFragment(BODY_FRAGMENT_NAME);

    expect(yDocToDfm({ doc, comments: [] }).isErr()).toBe(true);
  });
});
