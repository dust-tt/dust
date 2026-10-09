// @vitest-environment node
import { documentSchema } from "@app/components/editor/document/content";
import {
  loadDfm,
  loggableRefusal,
  saveDfm,
  isWritableThread,
} from "@app/components/editor/document/dfm_persistence";
import {
  getDocumentJSONComments,
  withDocumentJSONComments,
} from "@app/components/editor/document/DocumentComments";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { parseDfm } from "@app/lib/markdown/dfm";
import { FIXTURE, FIXTURES } from "@app/lib/markdown/dfm/tests/dfm.test_utils";
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

/** Each text node with its marks, comment ids by id, as `text[mark,id]`. */
function formattedTexts(document: JSONContent): string[] {
  const texts: string[] = [];
  const visit = (node: JSONContent) => {
    if (node.type === "text") {
      const marks = (node.marks ?? []).map((mark) =>
        mark.type === "comment" ? mark.attrs?.id : mark.type
      );
      texts.push(
        marks.length > 0 ? `${node.text}[${marks.join(",")}]` : `${node.text}`
      );
    }
    node.content?.forEach(visit);
  };
  visit(document);
  return texts;
}

// The live session server runs these functions in Node: see `document-model-runs-without-dom`.
it("runs without a DOM", () => {
  expect(typeof window).toBe("undefined");
  expect(typeof document).toBe("undefined");
});

describe("loadDfm", () => {
  it("opens a plain Markdown file", () => {
    const { envelope, content } = load("# Title\n\nSome **bold** text.\n");

    expect(envelope).toEqual({ frontMatter: null, anchorOrder: [] });
    expect(content.type).toBe("doc");
    expect(getDocumentJSONComments(content)).toEqual([]);
  });

  it.each([
    "French frontend ~done.",
    "5 * 3 = 15",
    "Call snake_case_name.",
    "Read array[0], see [note.",
    "Open path\\to\\file.",
    "Already escaped \\*b\\*.",
  ])("opens and saves text with characters Markdown escapes: %s", (source) => {
    const textOf = (markdown: string) =>
      load(markdown).content.content?.[0].content?.[0].text;

    // The serializer escapes them; the file must still open, and keep its text once saved.
    expect(textOf(roundTrip(source))).toBe(textOf(source));
  });

  it("keeps real formatting next to escaped characters", () => {
    const source = "~~Gone~~, **bold** and 5 \\* 3.\n";

    expect(roundTrip(source)).toBe(source);
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
      "anchors inside italic",
      "*foo :comment-start{id=c1}bar:comment-end{id=c1} baz*",
      ["foo [italic]", "bar[italic,c1]", " baz[italic]"],
    ],
    [
      "anchors inside bold, ending at its edge",
      "**foo :comment-start{id=c1}bar:comment-end{id=c1}** end",
      ["foo [bold]", "bar[bold,c1]", " end"],
    ],
    [
      "an anchor starting inside link text and ending after it",
      "[see :comment-start{id=c1}the docs](https://example.com) and more:comment-end{id=c1} here",
      ["see [link]", "the docs[link,c1]", " and more[c1]", " here"],
    ],
  ])("opens a file with %s", (_, body, texts) => {
    const source = `${body}\n\n${OPEN_THREAD}`;
    const { content } = load(source);

    expect(formattedTexts(content)).toEqual(texts);
    expect(load(roundTrip(source)).content).toEqual(content);
  });

  it.each([
    [
      "inline code at a comment's start",
      `Hi :comment-start{id=c1}\`code\` there:comment-end{id=c1}\n\n${OPEN_THREAD}`,
    ],
    [
      "inline code at a comment's end",
      `Hi :comment-start{id=c1}there \`code\`:comment-end{id=c1} now\n\n${OPEN_THREAD}`,
    ],
    [
      "a code block at a comment's start",
      `Intro :comment-start{id=c1}\n\n\`\`\`\ncode\n\`\`\`\n\nafter:comment-end{id=c1}\n\n${OPEN_THREAD}`,
    ],
  ])("refuses %s, which a save would drop from the comment", (_, source) => {
    const loaded = loadDfm(source);

    expect(loaded.isErr() && loaded.error).toContain(
      "starts or ends on text the editor cannot highlight"
    );
  });

  it.each([
    [
      "a table, at its line in the file after front matter",
      "---\ntitle: x\n---\n\n# T\n\nText.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n",
      "The Markdown uses formatting the editor cannot keep: a table at line 9.",
    ],
    [
      "a task list",
      "Intro.\n\n- [ ] todo\n",
      "The Markdown uses formatting the editor cannot keep: a task list at line 3.",
    ],
    [
      "HTML",
      "Intro.\n\n<div>x</div>\n",
      "The Markdown uses formatting the editor cannot keep: HTML at line 3.",
    ],
    [
      "a tilde fence",
      "Intro.\n\n~~~\ncode\n~~~\n",
      "The Markdown uses formatting the editor cannot keep: a code block fenced with ~~~ at line 3.",
    ],
    [
      "Markdown that changes when saved",
      "A\n\n* a\n+ b\n",
      "The Markdown would not read back the same after editing, from line 3.",
    ],
    [
      "Markdown that changes when saved, after extra blank lines",
      "A\n\n\n\n* a\n+ b\n",
      "The Markdown would not read back the same after editing, from line 5.",
    ],
    [
      "Markdown that changes when saved, after anchors on their own lines",
      `:comment-start{id=c1}\n\nA\n\n:comment-end{id=c1}\n\n* a\n+ b\n\n${OPEN_THREAD}`,
      "The Markdown would not read back the same after editing, from line 7.",
    ],
    [
      "an indented backtick fence",
      "Intro.\n\n  ```\n  code\n  ```\n",
      "The Markdown uses formatting the editor cannot keep: an indented code fence at line 3.",
    ],
    [
      "an anchor the editor cannot show",
      `See [docs](https://example.com/:comment-start{id=c1}a:comment-end{id=c1})\n\n${OPEN_THREAD}`,
      'A comment is anchored where the editor cannot show it: "c1".',
    ],
  ])("refuses %s, naming it and its line", (_, source, reason) => {
    const loaded = loadDfm(source);

    expect(loaded.isErr() && loaded.error).toBe(reason);
  });

  it("counts lines from the body's place in the file, past front matter that repeats it", () => {
    const loaded = loadDfm("---\nx: <hr>\n---\n\n<hr>\n");

    expect(loaded.isErr() && loaded.error).toBe(
      "The Markdown uses formatting the editor cannot keep: HTML at line 5."
    );
  });

  // Each source makes the editor write one of its own refusals: rewording one without updating
  // the log allowlist fails here instead of silently logging it as invalid DFM.
  it.each([
    ["an unsupported element", "| a | b |\n|---|---|\n| 1 | 2 |\n"],
    ["Markdown that changes when saved", "A\n\n* a\n+ b\n"],
    [
      "an anchor the editor cannot show",
      `See [docs](https://example.com/:comment-start{id=c1}a:comment-end{id=c1})\n\n${OPEN_THREAD}`,
    ],
    [
      "a comment edge on text the editor cannot highlight",
      `Hi :comment-start{id=c1}\`code\` there:comment-end{id=c1}\n\n${OPEN_THREAD}`,
    ],
    [
      "a comment covering no text the editor can highlight",
      `Run :comment-start{id=c1}\`npm test\`:comment-end{id=c1}\n\n${OPEN_THREAD}`,
    ],
  ])("logs the editor's own refusal for %s as it is", (_, source) => {
    const loaded = loadDfm(source);
    const reason = loaded.isErr() ? loaded.error : "";

    expect(reason).not.toBe("");
    expect(loggableRefusal(reason)).toBe(reason);
  });

  it("logs a codec error without what it quotes from the file", () => {
    const loaded = loadDfm(
      ":comment-start{id=c1 secret=SensitiveValue broken}hello:comment-end{id=c1}\n"
    );
    const reason = loaded.isErr() ? loaded.error : "";

    expect(reason).toContain("SensitiveValue");
    expect(loggableRefusal(reason)).toBe("The file is not valid DFM (line 1).");
  });

  it("opens a comment with inline code inside it", () => {
    const source = `:comment-start{id=c1}Run \`npm test\` now:comment-end{id=c1}\n\n${OPEN_THREAD}`;

    expect(roundTrip(source)).toBe(source);
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

  it("saves underlined text and opens it underlined again", () => {
    const source = "Hello ++brave++ world.\n";

    expect(roundTrip(source)).toBe(source);
    expect(load(source).content.content?.[0].content?.[1]).toEqual({
      type: "text",
      text: "brave",
      marks: [{ type: "underline" }],
    });
  });

  it("round-trips the codec fixture, anchors and threads included", () => {
    expect(roundTrip(FIXTURE)).toBe(FIXTURE);
  });

  it.each([
    "**foo :comment-start{id=c1}bar:comment-end{id=c1}** end",
    "*foo :comment-start{id=c1}bar:comment-end{id=c1}* end",
    "**:comment-start{id=c1}bar:comment-end{id=c1}** end",
    "[foo :comment-start{id=c1}bar:comment-end{id=c1}](https://example.com) end",
  ])(
    "keeps anchors inside the formatting of the text they comment: %s",
    (body) => {
      const source = `${body}\n\n${OPEN_THREAD}`;

      expect(roundTrip(source)).toBe(source);
    }
  );

  it("keeps message signatures through load and save", () => {
    const signed = FIXTURES.find(({ name }) => name === "signed_comments.md");
    if (!signed) {
      throw new Error("Missing signed_comments.md fixture.");
    }

    expect(roundTrip(signed.source)).toBe(signed.source);
  });

  it("writes anchors inside formatting without splitting it", () => {
    const source = `Some **bo:comment-start{id=c1}ld** and *it:comment-end{id=c1}alic* text.\n\n${OPEN_THREAD}`;

    expect(roundTrip(source)).toBe(source);
  });

  const commented = { type: "comment", attrs: { id: "c1" } };
  it.each([
    [
      "italic running into the comment",
      [
        { type: "text", text: "foo ", marks: [{ type: "italic" }] },
        { type: "text", text: "bar", marks: [{ type: "italic" }, commented] },
        { type: "text", text: " baz" },
      ],
      "*foo :comment-start{id=c1}bar:comment-end{id=c1}* baz",
    ],
    [
      "bold running out of the comment",
      [
        { type: "text", text: "foo " },
        { type: "text", text: "bar", marks: [{ type: "bold" }, commented] },
        { type: "text", text: " baz", marks: [{ type: "bold" }] },
      ],
      "foo **:comment-start{id=c1}bar:comment-end{id=c1} baz**",
    ],
    [
      "bold right after a word, where an anchor inside it would not read back",
      [
        { type: "text", text: "foo" },
        { type: "text", text: "bar", marks: [{ type: "bold" }, commented] },
      ],
      "foo:comment-start{id=c1}**bar**:comment-end{id=c1}",
    ],
    [
      "a link across both edges",
      [
        {
          type: "text",
          text: "see the docs",
          marks: [{ type: "link", attrs: { href: "https://example.com" } }],
        },
        {
          type: "text",
          text: " here",
          marks: [
            { type: "link", attrs: { href: "https://example.com" } },
            commented,
          ],
        },
        {
          type: "text",
          text: " now",
          marks: [{ type: "link", attrs: { href: "https://example.com" } }],
        },
      ],
      "[see the docs:comment-start{id=c1} here:comment-end{id=c1} now](https://example.com)",
    ],
  ])("saves %s and reopens it the same", (_, content, body) => {
    const document = withDocumentJSONComments(
      { type: "doc", content: [{ type: "paragraph", content }] },
      [COMMENT]
    );

    const saved = saveDfm({ frontMatter: null, anchorOrder: [] }, document);

    expect(saved.isOk() && saved.value).toBe(`${body}\n\n${OPEN_THREAD}`);
    if (saved.isOk()) {
      expect(markedTexts(load(saved.value).content)).toEqual(
        markedTexts(document)
      );
    }
  });

  const twoThreads = (first: string, second: string) =>
    `:::annotations\n::comment{id=${first} status=open}\n\n::message{author=user:u name="U" at=${AT}}\n\nOne.\n\n::comment{id=${second} status=open}\n\n::message{author=user:u name="U" at=${AT}}\n\nTwo.\n:::\n`;

  it.each([
    [
      "nested ends",
      "A :comment-start{id=c2}b :comment-start{id=c1}c:comment-end{id=c1}:comment-end{id=c2} d",
    ],
    [
      "crossing ends",
      "A :comment-start{id=c2}b :comment-start{id=c1}c:comment-end{id=c2}:comment-end{id=c1} d",
    ],
    [
      "starts sharing a place",
      "A :comment-start{id=c1}:comment-start{id=c2}b:comment-end{id=c1} c:comment-end{id=c2} d",
    ],
    [
      "a start written before an end at the same place",
      "A :comment-start{id=c1}b:comment-start{id=c2}:comment-end{id=c1}c:comment-end{id=c2} d",
    ],
  ])("keeps %s in the file's order", (_, body) => {
    const source = `${body}\n\n${twoThreads("c1", "c2")}`;

    expect(roundTrip(source)).toBe(source);
  });

  it("nests the anchors of a new comment with the existing ones", () => {
    const source = `A :comment-start{id=c1}b c:comment-end{id=c1} d\n\n${twoThreads("c1", "c2")}`;
    const { envelope, content } = load(source);
    const paragraph = content.content?.[0];
    if (!paragraph?.content) {
      throw new Error("No paragraph.");
    }
    // A second comment on exactly the same text, as the editor adds one.
    paragraph.content = paragraph.content.map((node) =>
      node.marks?.some((mark) => mark.type === "comment")
        ? {
            ...node,
            marks: [...node.marks, { type: "comment", attrs: { id: "c2" } }],
          }
        : node
    );

    const saved = saveDfm(envelope, content);

    expect(saved.isOk() && saved.value.split("\n")[0]).toBe(
      "A :comment-start{id=c1}:comment-start{id=c2}b c:comment-end{id=c2}:comment-end{id=c1} d"
    );
  });

  it("saves a new comment around an existing one", () => {
    const source = `A :comment-start{id=c1}b:comment-end{id=c1} c\n\n${twoThreads("c1", "c2")}`;
    const { envelope, content } = load(source);
    const paragraph = content.content?.[0];
    if (!paragraph?.content) {
      throw new Error("No paragraph.");
    }
    // The editor adds the new comment's mark after the existing one, as on the whole paragraph.
    paragraph.content = paragraph.content.map((node) => ({
      ...node,
      marks: [...(node.marks ?? []), { type: "comment", attrs: { id: "c2" } }],
    }));

    const saved = saveDfm(envelope, content);

    expect(saved.isOk() && saved.value.split("\n")[0]).toBe(
      ":comment-start{id=c2}A :comment-start{id=c1}b:comment-end{id=c1} c:comment-end{id=c2}"
    );
  });

  it("keeps front matter when the body is empty", () => {
    const source = "---\ntitle: x\n---\n";

    expect(roundTrip(source)).toBe(source);
  });

  it("writes LF line endings for a CRLF file", () => {
    expect(roundTrip("# Title\r\n\r\nText\r\n")).toBe("# Title\n\nText\n");
  });

  it("round-trips images with their Markdown source", () => {
    for (const source of [
      "![Revenue chart](pod-abc/charts/revenue.png)\n",
      "# Report\n\n![Chart](pod-abc/chart.png)\n\nText.\n",
      "> ![Chart](pod-abc/chart.png)\n",
      "- ![Chart](pod-abc/chart.png)\n",
      '![A \\[draft\\] chart](<conversation-c1/my chart.png> "Q3 \\"draft\\"")\n',
      "Before ![x](pod-abc/x%20y.png) after.\n",
      ":comment-start{id=c1}See ![x](pod-abc/x.png) here.:comment-end{id=c1}\n\n" +
        OPEN_THREAD,
    ]) {
      expect(roundTrip(source)).toBe(source);
      expect(() =>
        documentSchema.nodeFromJSON(load(source).content).check()
      ).not.toThrow();
    }
  });

  it("refuses content the editor cannot write as Markdown", () => {
    const saved = saveDfm(
      { frontMatter: null, anchorOrder: [] },
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

describe("isWritableThread", () => {
  it("accepts a thread the codec can write", () => {
    expect(isWritableThread(COMMENT)).toBe(true);
  });

  it.each([
    ["a directive line", "First line\n::message{author=user:x}"],
    ["an unclosed code fence", "```\ncode"],
  ])("refuses a message with %s", (_, body) => {
    const thread: DfmComment = {
      ...COMMENT,
      messages: [{ ...COMMENT.messages[0], body }],
    };

    expect(isWritableThread(thread)).toBe(false);
  });
});
