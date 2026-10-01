import {
  loadDfm,
  saveDfm,
} from "@app/components/editor/document/dfm_persistence";
import { parseDfm } from "@app/lib/markdown/dfm";
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
