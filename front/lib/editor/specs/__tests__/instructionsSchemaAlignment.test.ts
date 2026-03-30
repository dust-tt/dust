import { INSTRUCTION_BLOCK_NODE_NAME } from "@app/lib/editor/specs/instructionBlockSpec";
import { INSTRUCTIONS_ROOT_NODE_NAME } from "@app/lib/editor/specs/instructionsRootSpec";
import { INSTRUCTIONS_SCHEMA } from "@app/lib/editor/specs/instructionsSchema";
import { validateNonRootInstructionReplaceHtml } from "@app/lib/editor/specs/nonRootInstructionReplaceValidation";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { JSDOM } from "jsdom";
import { DOMParser as PMDOMParser } from "prosemirror-model";
import { describe, expect, it } from "vitest";

function parseBlocks(html: string): number {
  const parser = PMDOMParser.fromSchema(INSTRUCTIONS_SCHEMA);
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  const tempDiv = dom.window.document.createElement("div");
  tempDiv.innerHTML = html;
  const doc = parser.parse(tempDiv);
  // doc → instructionsRoot → its children are the parsed top-level blocks.
  return doc.firstChild?.childCount ?? 0;
}

describe("INSTRUCTIONS_SCHEMA — block counting", () => {
  it("bare div with text → 1 block in PM (transparent wrapper → paragraph)", () => {
    expect(parseBlocks("<div>test1</div>")).toBe(1);
  });

  it("single paragraph → 1 block", () => {
    expect(parseBlocks("<p>Simple paragraph</p>")).toBe(1);
  });

  it("heading + paragraph → 2 blocks", () => {
    expect(parseBlocks("<h2>Heading</h2><p>Text</p>")).toBe(2);
  });

  it("bare div wrapping heading + paragraph → 2 blocks (div is transparent)", () => {
    expect(parseBlocks("<div><h2>Heading</h2><p>Text</p></div>")).toBe(2);
  });

  it("unknown element wrapping a paragraph → 1 block (element is transparent)", () => {
    expect(parseBlocks("<section><p>Text</p></section>")).toBe(1);
  });

  it("bare text without any wrapper → 1 block (auto-wrapped in paragraph)", () => {
    expect(parseBlocks("Hello world")).toBe(1);
  });

  it("single list → 1 block", () => {
    expect(parseBlocks("<ul><li><p>one</p></li><li><p>two</p></li></ul>")).toBe(
      1
    );
  });

  it("instruction-block div → 1 block", () => {
    expect(
      parseBlocks(`<div data-type="instruction-block"><p>Content</p></div>`)
    ).toBe(1);
  });

  it("two sibling paragraphs → 2 blocks", () => {
    expect(parseBlocks("<p>First</p><p>Second</p>")).toBe(2);
  });

  it("paragraph followed by list → 2 blocks", () => {
    expect(parseBlocks("<p>Intro</p><ul><li><p>item</p></li></ul>")).toBe(2);
  });

  it("instructions-root div with two children → 2 blocks", () => {
    expect(
      parseBlocks(
        `<div data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"><h2>Role</h2><p>Body</p></div>`
      )
    ).toBe(2);
  });
});

describe("validateNonRootInstructionReplaceHtml — single-block replace", () => {
  it("rejects bare div even though PM block count is 1 (typical p→div LLM mistake)", () => {
    expect(
      validateNonRootInstructionReplaceHtml(
        "6ff6ef20",
        "<div>test1</div>"
      ).isErr()
    ).toBe(true);
  });

  it("accepts paragraph", () => {
    expect(
      validateNonRootInstructionReplaceHtml("6ff6ef20", "<p>test1</p>").isOk()
    ).toBe(true);
  });

  it("accepts instruction-block wrapper", () => {
    expect(
      validateNonRootInstructionReplaceHtml(
        "6ff6ef20",
        `<div data-type="instruction-block"><p>x</p></div>`
      ).isOk()
    ).toBe(true);
  });

  it("rejects several top-level blocks", () => {
    expect(
      validateNonRootInstructionReplaceHtml(
        "6ff6ef20",
        "<p>a</p><p>b</p>"
      ).isErr()
    ).toBe(true);
  });

  it("rejects unknown outer wrapper despite PM collapsing to one inner block", () => {
    expect(
      validateNonRootInstructionReplaceHtml(
        "6ff6ef20",
        "<section><p>Text</p></section>"
      ).isErr()
    ).toBe(true);
  });

  it("accepts bare text (no element children)", () => {
    expect(
      validateNonRootInstructionReplaceHtml("6ff6ef20", "Hello").isOk()
    ).toBe(true);
  });
});

describe("INSTRUCTIONS_SCHEMA — schema structure", () => {
  it("instructionsRoot node is present", () => {
    expect(
      INSTRUCTIONS_SCHEMA.nodes[INSTRUCTIONS_ROOT_NODE_NAME]
    ).toBeDefined();
  });

  it("instructionBlock node is present in block group", () => {
    const spec = INSTRUCTIONS_SCHEMA.nodes[INSTRUCTION_BLOCK_NODE_NAME];
    expect(spec).toBeDefined();
    expect(spec.spec.group).toBe("block");
  });

  it("doc content is instructionsRoot", () => {
    expect(INSTRUCTIONS_SCHEMA.nodes.doc.spec.content).toBe(
      INSTRUCTIONS_ROOT_NODE_NAME
    );
  });

  it("parser rules include instructions-root and instruction-block selectors", () => {
    const parser = PMDOMParser.fromSchema(INSTRUCTIONS_SCHEMA);
    const tags = parser.rules.filter((r) => r.tag).map((r) => r.tag as string);
    expect(tags).toContain(
      `div[data-type='${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}']`
    );
    expect(tags).toContain("div[data-type='instruction-block']");
  });
});
