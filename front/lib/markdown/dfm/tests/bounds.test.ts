import {
  anchorComment,
  extractAnchors,
  parseDfm,
  readMessageSuggestions,
  serializeDfm,
  suggestionBlock,
} from "@app/lib/markdown/dfm";
import { INPUT_LIMITS } from "@app/lib/markdown/dfm/parser";
import {
  expectError,
  withMessage,
} from "@app/lib/markdown/dfm/tests/dfm.test_utils";
import { fromMarkdown } from "mdast-util-from-markdown";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The parser is spied on: automocked, then given back its real implementation.
vi.mock("mdast-util-from-markdown");

const parser = vi.mocked(fromMarkdown);

beforeAll(async () => {
  const original = await vi.importActual<
    typeof import("mdast-util-from-markdown")
  >("mdast-util-from-markdown");
  parser.mockImplementation(original.fromMarkdown);
});

/** True when some parser call received `text`, on its own or inside a larger input. */
function parsed(text: string): boolean {
  return parser.mock.calls.some(
    ([input]) => typeof input === "string" && input.includes(text)
  );
}

/** One text per bound, each just past it. */
const OUT_OF_BOUNDS: [string, string, string][] = [
  ["length", "x".repeat(INPUT_LIMITS.length + 1), "exceeds"],
  [
    "line prefix",
    `${">".repeat(INPUT_LIMITS.linePrefix + 1)} deep`,
    "nests deeper than",
  ],
  [
    "line prefix behind a list marker",
    `- ${">".repeat(INPUT_LIMITS.linePrefix)} deep`,
    "nests deeper than",
  ],
  [
    "delimiters",
    "]".repeat(INPUT_LIMITS.delimiters + 1),
    "emphasis, link or code delimiters",
  ],
  ["list items", "1. a\n".repeat(INPUT_LIMITS.listItems + 1), "list items"],
  ["empty list items", "-\n".repeat(INPUT_LIMITS.listItems + 1), "list items"],
  [
    "line prefix behind a byte order mark",
    `\uFEFF${">".repeat(INPUT_LIMITS.linePrefix + 1)} deep`,
    "nests deeper than",
  ],
];

const DEEP = `${">".repeat(INPUT_LIMITS.linePrefix + 1)} deep`;

// The dfm-bounded-input contract: every public function refuses out-of-bounds text before the
// Markdown parser sees it. The parser is spied on, so a check placed after a parse of that
// text fails here. Parsing the other, in-bounds parts of a document first is fine.
describe("dfm-bounded-input", () => {
  beforeEach(() => {
    parser.mockClear();
  });

  describe.each(OUT_OF_BOUNDS)("text over the %s bound", (_, text, message) => {
    it("is refused by parseDfm", () => {
      expectError(parseDfm(text), message);
      expect(parsed(text)).toBe(false);
    });

    it("is refused by parseDfm after front matter", () => {
      expectError(parseDfm(`---\na: b\n---\n\n${text}`), message);
      expect(parsed(text)).toBe(false);
    });

    it("is refused by extractAnchors", () => {
      expectError(extractAnchors(text), message);
      expect(parsed(text)).toBe(false);
    });

    it("is refused by anchorComment", () => {
      expectError(anchorComment({ body: text, id: "c1", quote: "a" }), message);
      expect(parsed(text)).toBe(false);
    });

    it("is refused by serializeDfm as a body", () => {
      expectError(
        serializeDfm({ frontMatter: null, body: text, comments: [] }),
        message
      );
      expect(parsed(text)).toBe(false);
    });

    it("is refused by serializeDfm as a message body", () => {
      expectError(serializeDfm(withMessage({ body: text })), message);
      expect(parsed(text)).toBe(false);
    });

    it("is refused by readMessageSuggestions", () => {
      expectError(readMessageSuggestions(text), message);
      expect(parsed(text)).toBe(false);
    });
  });

  // Wrapped in a block, a byte order mark no longer opens the text and reads as content.
  it.each(OUT_OF_BOUNDS.filter(([name]) => !name.includes("byte order mark")))(
    "refuses a suggestion block over the %s bound",
    (_, text, message) => {
      expectError(suggestionBlock(text), message);
      expect(parsed(text)).toBe(false);
    }
  );

  it("locates a bound in the body on its source line", () => {
    expectError(parseDfm(`---\na: b\n---\n\n${DEEP}`), "nests deeper than", 5);
  });

  it("skips one byte order mark per layer, as the parser does", () => {
    // parseDfm drops the file's mark; the parser then drops the one opening the body.
    expectError(parseDfm(`\uFEFF\uFEFF${DEEP}`), "nests deeper than");
    expect(parsed(DEEP)).toBe(false);
  });

  it("reads a bare carriage return as a line ending in extractAnchors", () => {
    // The other functions refuse a bare carriage return before anything else.
    expectError(extractAnchors(`fine\r${DEEP}`), "nests deeper than");
    expect(parsed(DEEP)).toBe(false);
  });

  it("bounds the anchor-free text in anchorComment", () => {
    const split = Math.floor(INPUT_LIMITS.linePrefix / 2);
    const body = `${">".repeat(split)}:comment-start{id=c1}${DEEP.slice(split)}:comment-end{id=c1}`;

    expectError(
      anchorComment({ body, id: "c2", quote: "deep" }),
      "nests deeper than"
    );
    expect(parsed(DEEP)).toBe(false);
  });

  it("bounds the anchored body in anchorComment", () => {
    const id = "x".repeat(INPUT_LIMITS.length);

    expectError(anchorComment({ body: "a", id, quote: "a" }), "exceeds");
    expect(parsed(id)).toBe(false);
  });

  it("refuses a body and messages that exceed the bounds together", () => {
    const half = "*".repeat(INPUT_LIMITS.delimiters / 2 + 1);

    expectError(
      serializeDfm({
        ...withMessage({ body: half }),
        body: `Hello :comment-start{id=c1}world:comment-end{id=c1}. ${half}`,
      }),
      "emphasis, link or code delimiters"
    );
  });

  it("parses text within the bounds", () => {
    const source = `${"> ".repeat(INPUT_LIMITS.linePrefix / 2 - 1)}deep\n\n${"- a\n".repeat(100)}`;

    expect(parseDfm(source).isOk()).toBe(true);
    expect(parser).toHaveBeenCalled();
  });
});
