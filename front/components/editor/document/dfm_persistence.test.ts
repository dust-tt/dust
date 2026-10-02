import {
  loadDfm,
  saveDfm,
} from "@app/components/editor/document/dfm_persistence";
import { extractAnchors, parseDfm, serializeDfm } from "@app/lib/markdown/dfm";
import { FIXTURE } from "@app/lib/markdown/dfm/tests/dfm.test_utils";
import { describe, expect, it } from "vitest";

const AT = "2026-09-25T14:16:32.380Z";
const THREAD = `:::annotations\n::comment{id=c1 status=resolved}\n\n::message{author=user:usr_daph name="Daph" at=${AT}}\n\nKept as is.\n:::\n`;

describe("loadDfm", () => {
  it("opens a plain Markdown file", () => {
    const loaded = loadDfm("# Title\n\nSome **bold** text.\n");

    expect(loaded.isOk()).toBe(true);
    if (loaded.isOk()) {
      expect(loaded.value.envelope).toEqual({
        frontMatter: null,
        comments: [],
      });
      expect(loaded.value.content.type).toBe("doc");
    }
  });

  it("keeps front matter and detached threads in the envelope", () => {
    const loaded = loadDfm(`---\ntitle: x\n---\n\n# Title\n\n${THREAD}`);

    expect(loaded.isOk()).toBe(true);
    if (loaded.isOk()) {
      expect(loaded.value.envelope.frontMatter).toBe("title: x");
      expect(loaded.value.envelope.comments.map((c) => c.id)).toEqual(["c1"]);
    }
  });

  it.each([
    [
      "a file with comment anchors",
      `Hi :comment-start{id=c1}there:comment-end{id=c1}\n\n${THREAD.replace("resolved", "open")}`,
      "Comments are not supported",
    ],
    [
      "invalid DFM",
      "Body\n\n:::annotations\n::comment{id=c1}\n:::\n",
      "status",
    ],
    [
      "Markdown the editor cannot reproduce",
      "| a | b |\n|---|---|\n| 1 | 2 |\n",
      "formatting that isn't supported",
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
    const loaded = loadDfm(source);
    expect(loaded.isOk()).toBe(true);
    if (!loaded.isOk()) {
      return;
    }

    const saved = saveDfm(loaded.value.envelope, loaded.value.content);

    expect(saved.isOk()).toBe(true);
    if (saved.isOk()) {
      expect(saved.value).toBe(source);
      expect(parseDfm(saved.value).isOk()).toBe(true);
    }
  });

  it("round-trips the codec fixture once its anchors are removed", () => {
    const parsed = parseDfm(FIXTURE);
    expect(parsed.isOk()).toBe(true);
    if (!parsed.isOk()) {
      return;
    }
    const text = extractAnchors(parsed.value.body);
    expect(text.isOk()).toBe(true);
    if (!text.isOk()) {
      return;
    }
    const source = serializeDfm({ ...parsed.value, body: text.value.text });
    expect(source.isOk()).toBe(true);
    if (!source.isOk()) {
      return;
    }

    const loaded = loadDfm(source.value);
    expect(loaded.isOk()).toBe(true);
    if (!loaded.isOk()) {
      return;
    }
    const saved = saveDfm(loaded.value.envelope, loaded.value.content);

    expect(saved.isOk()).toBe(true);
    if (saved.isOk()) {
      expect(saved.value).toBe(source.value);
    }
  });

  it("keeps front matter when the body is empty", () => {
    const source = "---\ntitle: x\n---\n";
    const loaded = loadDfm(source);
    expect(loaded.isOk()).toBe(true);
    if (!loaded.isOk()) {
      return;
    }

    const saved = saveDfm(loaded.value.envelope, loaded.value.content);

    expect(saved.isOk()).toBe(true);
    if (saved.isOk()) {
      expect(saved.value).toBe(source);
    }
  });

  it("writes LF line endings for a CRLF file", () => {
    const loaded = loadDfm("# Title\r\n\r\nText\r\n");
    expect(loaded.isOk()).toBe(true);
    if (!loaded.isOk()) {
      return;
    }

    const saved = saveDfm(loaded.value.envelope, loaded.value.content);

    expect(saved.isOk()).toBe(true);
    if (saved.isOk()) {
      expect(saved.value).toBe("# Title\n\nText\n");
    }
  });

  it("refuses content the editor cannot write as Markdown", () => {
    const saved = saveDfm(
      { frontMatter: null, comments: [] },
      { type: "doc", content: [{ type: "table" }] }
    );

    expect(saved.isErr()).toBe(true);
    if (saved.isErr()) {
      expect(saved.error).toContain("cannot be saved as Markdown");
    }
  });

  it("writes an edited body into the same envelope", () => {
    const loaded = loadDfm(`# Title\n\n${THREAD}`);
    expect(loaded.isOk()).toBe(true);
    if (!loaded.isOk()) {
      return;
    }

    const saved = saveDfm(loaded.value.envelope, {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Rewritten." }],
        },
      ],
    });

    expect(saved.isOk()).toBe(true);
    if (saved.isOk()) {
      expect(saved.value).toBe(`Rewritten.\n\n${THREAD}`);
    }
  });
});
