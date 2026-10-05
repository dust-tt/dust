import {
  getDocumentJSONComments,
  withDocumentJSONComments,
} from "@app/components/editor/document/DocumentComments";
import {
  loadDfm,
  saveDfm,
} from "@app/components/editor/document/dfm_persistence";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { parseDfm } from "@app/lib/markdown/dfm";
import { FIXTURE } from "@app/lib/markdown/dfm/tests/dfm.test_utils";
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";

const AT = "2026-09-25T14:16:32.380Z";
const THREAD = `:::annotations\n::comment{id=c1 status=resolved}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nKept as is.\n:::\n`;
const OPEN_THREAD = THREAD.replace("resolved", "open");

const COMMENT: DfmComment = {
  id: "c1",
  status: "open",
  messages: [
    {
      author: { kind: "user", id: "usr_daph", name: "Daph" },
      createdAt: AT,
      body: "Kept as is.",
    },
  ],
};

function load(source: string) {
  const loaded = loadDfm(source);
  if (loaded.isErr()) {
    throw new Error(loaded.error);
  }
  return loaded.value;
}

function roundTrip(source: string): string {
  const { envelope, content } = load(source);
  const saved = saveDfm(envelope, content);
  if (saved.isErr()) {
    throw new Error(saved.error);
  }
  return saved.value;
}

/** Comment ids on each text node, as `text[id,id]`. */
function markedTexts(document: JSONContent): string[] {
  const texts: string[] = [];
  const visit = (node: JSONContent) => {
    if (node.type === "text") {
      const ids = (node.marks ?? [])
        .filter((mark) => mark.type === "comment")
        .map((mark) => mark.attrs?.id);
      texts.push(
        ids.length > 0 ? `${node.text}[${ids.join(",")}]` : `${node.text}`
      );
    }
    node.content?.forEach(visit);
  };
  visit(document);
  return texts;
}

describe("loadDfm", () => {
  it("opens a plain Markdown file", () => {
    const { envelope, content } = load("# Title\n\nSome **bold** text.\n");

    expect(envelope).toEqual({ frontMatter: null });
    expect(content.type).toBe("doc");
    expect(getDocumentJSONComments(content)).toEqual([]);
  });

  it("keeps front matter in the envelope and threads in the document", () => {
    const { envelope, content } = load(
      `---\ntitle: x\n---\n\n# Title\n\n${THREAD}`
    );

    expect(envelope.frontMatter).toBe("title: x");
    expect(getDocumentJSONComments(content).map((c) => c.id)).toEqual(["c1"]);
  });

  it("turns anchors into comment marks, overlapping and across paragraphs", () => {
    const thread = (id: string) =>
      `::comment{id=${id} status=open}\n\n::message{author=user:u name="U" at=${AT}}\n\nNote.\n`;
    const { content } = load(
      `:comment-start{id=a}One :comment-start{id=b}two:comment-end{id=a} three\n\nfour:comment-end{id=b} five\n\n:::annotations\n${thread("a")}\n${thread("b")}:::\n`
    );

    expect(markedTexts(content)).toEqual([
      "One [a]",
      "two[a,b]",
      " three[b]",
      "four[b]",
      " five",
    ]);
    expect(JSON.stringify(content)).not.toContain("commentAnchor");
  });

  it("does not mark inline code inside a commented range", () => {
    const { content } = load(
      `:comment-start{id=c1}Run \`npm test\` now:comment-end{id=c1}\n\n${OPEN_THREAD}`
    );

    expect(markedTexts(content)).toEqual(["Run [c1]", "npm test", " now[c1]"]);
  });

  it.each([
    [
      "invalid DFM",
      "Body\n\n:::annotations\n::comment{id=c1}\n:::\n",
      "status",
    ],
    [
      "Markdown the editor cannot reproduce",
      "| a | b |\n|---|---|\n| 1 | 2 |\n",
      "formatting the editor cannot keep",
    ],
    [
      "a comment covering only code",
      `Run :comment-start{id=c1}\`npm test\`:comment-end{id=c1}\n\n${OPEN_THREAD}`,
      "covers no text the editor can highlight",
    ],
    [
      "an anchor inside a link destination",
      `See [docs](https://example.com/:comment-start{id=c1}a:comment-end{id=c1})\n\n${OPEN_THREAD}`,
      "cannot show it",
    ],
  ])("refuses %s with a reason", (_, source, reason) => {
    const loaded = loadDfm(source);

    expect(loaded.isErr()).toBe(true);
    if (loaded.isErr()) {
      expect(loaded.error).toContain(reason);
    }
  });
});

describe("saveDfm", () => {
  it("round-trips a file through load and save", () => {
    const source = `---\ntitle: x\n---\n\n# Title\n\nSome **bold** text.\n\n- one\n- two\n\n${THREAD}`;

    const saved = roundTrip(source);

    expect(saved).toBe(source);
    expect(parseDfm(saved).isOk()).toBe(true);
  });

  it("round-trips the codec fixture, anchors and threads included", () => {
    expect(roundTrip(FIXTURE)).toBe(FIXTURE);
  });

  it("writes anchors around formatting without breaking it", () => {
    const source = `Some **bo:comment-start{id=c1}ld** and *it:comment-end{id=c1}alic* text.\n\n${OPEN_THREAD}`;
    const saved = roundTrip(source);

    expect(saved).toBe(
      `Some **bo**:comment-start{id=c1}**ld** and *it*:comment-end{id=c1}*alic* text.\n\n${OPEN_THREAD}`
    );
    expect(markedTexts(load(saved).content)).toEqual(
      markedTexts(load(source).content)
    );
  });

  it("keeps front matter when the body is empty", () => {
    const source = "---\ntitle: x\n---\n";

    expect(roundTrip(source)).toBe(source);
  });

  it("writes LF line endings for a CRLF file", () => {
    expect(roundTrip("# Title\r\n\r\nText\r\n")).toBe("# Title\n\nText\n");
  });

  it("refuses content the editor cannot write as Markdown", () => {
    const saved = saveDfm(
      { frontMatter: null },
      { type: "doc", content: [{ type: "table" }] }
    );

    expect(saved.isErr()).toBe(true);
    if (saved.isErr()) {
      expect(saved.error).toContain("cannot be saved as Markdown");
    }
  });

  it("writes an edited body with the document's threads", () => {
    const { envelope } = load("# Title\n");
    const saved = saveDfm(
      envelope,
      withDocumentJSONComments(
        {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Rewritten " },
                {
                  type: "text",
                  text: "here",
                  marks: [{ type: "comment", attrs: { id: "c1" } }],
                },
                { type: "text", text: "." },
              ],
            },
          ],
        },
        [COMMENT]
      )
    );

    expect(saved.isOk()).toBe(true);
    if (saved.isOk()) {
      expect(saved.value).toBe(
        `Rewritten :comment-start{id=c1}here:comment-end{id=c1}.\n\n${OPEN_THREAD}`
      );
    }
  });

  it("keeps a thread whose text was deleted", () => {
    const { envelope, content } = load(
      `Hi :comment-start{id=c1}there:comment-end{id=c1}\n\n${OPEN_THREAD}`
    );
    const saved = saveDfm(
      envelope,
      withDocumentJSONComments(
        {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Hi" }] },
          ],
        },
        getDocumentJSONComments(content)
      )
    );

    expect(saved.isOk()).toBe(true);
    if (saved.isOk()) {
      expect(saved.value).toBe(`Hi\n\n${OPEN_THREAD}`);
    }
  });
});
