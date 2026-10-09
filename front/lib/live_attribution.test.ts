// @vitest-environment node
import { removedTexts } from "@app/lib/live_attribution";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

/** A shared document whose body is one paragraph per text. */
function documentOf(texts: string[]) {
  const document = new Y.Doc();
  document.getXmlFragment("body").insert(
    0,
    texts.map((text) => {
      const paragraph = new Y.XmlElement("paragraph");
      paragraph.insert(0, [new Y.XmlText(text)]);
      return paragraph;
    })
  );
  return document;
}

const paragraphText = (document: Y.Doc, index: number) => {
  const paragraph = document.getXmlFragment("body").get(index);
  const text = paragraph instanceof Y.XmlElement ? paragraph.get(0) : null;
  if (!(text instanceof Y.XmlText)) {
    throw new Error(`No paragraph ${index}.`);
  }
  return text;
};

/** The removed texts of `change`, read as the collab server reads them. */
function removedBy(document: Y.Doc, change: () => void) {
  let removed: string[] = [];
  const body = document.getXmlFragment("body");
  const onChange = (_events: unknown, transaction: Y.Transaction) => {
    removed = removedTexts(transaction).map(({ text }) => text);
  };
  body.observeDeep(onChange);
  document.transact(change);
  body.unobserveDeep(onChange);
  return removed;
}

describe("removedTexts", () => {
  it("reads a run of text deleted inside a paragraph that stays", () => {
    const document = documentOf(["Hello brave world."]);

    expect(
      removedBy(document, () => paragraphText(document, 0).delete(6, 6))
    ).toEqual(["brave "]);
  });

  it("reads deleted text in document order, across formatting", () => {
    const document = documentOf(["OLD"]);
    // Written after, but standing before: storage order is not document order.
    paragraphText(document, 0).insert(0, "NEW", { bold: {} });

    expect(
      removedBy(document, () => paragraphText(document, 0).delete(0, 6))
    ).toEqual(["NEWOLD"]);
  });

  it("reads deleted paragraphs in document order, apart", () => {
    const document = documentOf(["First", "Last"]);
    const middle = new Y.XmlElement("paragraph");
    middle.insert(0, [new Y.XmlText("Middle")]);
    document.getXmlFragment("body").insert(1, [middle]);

    expect(
      removedBy(document, () => document.getXmlFragment("body").delete(0, 3))
    ).toEqual(["First Middle Last"]);
  });

  it("keeps apart runs separated by text that stays", () => {
    const document = documentOf(["one two three"]);

    expect(
      removedBy(document, () => {
        paragraphText(document, 0).delete(7, 6);
        paragraphText(document, 0).delete(0, 4);
      })
    ).toEqual(["one ", " three"]);
  });
});
