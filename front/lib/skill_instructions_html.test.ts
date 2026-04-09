import { convertMarkdownToBlockHtml } from "@app/lib/skill_instructions_html";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";

const HEX_BLOCK_ID = /^[a-f0-9]{8}$/;

function load(html: string) {
  return cheerio.load(html, { xmlMode: false }, false);
}

describe("convertMarkdownToBlockHtml", () => {
  it("wraps content in instructions root with stable root block id", () => {
    const html = convertMarkdownToBlockHtml("Hello");
    const $ = load(html);

    const root = $(`div[data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"]`);
    expect(root).toHaveLength(1);
    expect(root.attr("data-block-id")).toBe(INSTRUCTIONS_ROOT_TARGET_BLOCK_ID);
  });

  it("assigns 8-char hex block ids to block nodes (paragraph + heading)", () => {
    const html = convertMarkdownToBlockHtml("# Title\n\nBody");
    const $ = load(html);

    const withId = $("[data-block-id]")
      .map((_, el) => $(el).attr("data-block-id"))
      .get()
      .filter(Boolean);

    expect(withId).toContain(INSTRUCTIONS_ROOT_TARGET_BLOCK_ID);

    const nonRootIds = withId.filter(
      (id) => id !== INSTRUCTIONS_ROOT_TARGET_BLOCK_ID
    );
    expect(nonRootIds).toHaveLength(2);
    for (const id of nonRootIds) {
      expect(id).toMatch(HEX_BLOCK_ID);
    }
    expect(new Set(nonRootIds).size).toBe(2);
  });

  it("strips class, style, and id from rendered HTML", () => {
    const html = convertMarkdownToBlockHtml("- Item\n\nParagraph");
    const $ = load(html);

    expect($("[class]").length).toBe(0);
    expect($("[style]").length).toBe(0);
    expect($("[id]").length).toBe(0);
  });

  it("preserves semantic tags and data-block-id while stripping presentation attrs", () => {
    const html = convertMarkdownToBlockHtml(
      "## Section\n\n[Link](https://example.com)"
    );
    const $ = load(html);

    expect($("h2").length).toBe(1);
    expect($("h2").attr("data-block-id")).toMatch(HEX_BLOCK_ID);
    expect($("p a[href='https://example.com']").length).toBe(1);
    expect($("a[class]").length).toBe(0);
  });

  it("puts block ids on list containers for bullet and ordered lists", () => {
    const bullet = convertMarkdownToBlockHtml("- one\n- two");
    const $b = load(bullet);
    expect($b("ul").length).toBe(1);
    expect($b("ul").attr("data-block-id")).toMatch(HEX_BLOCK_ID);

    const ordered = convertMarkdownToBlockHtml("1. first\n2. second");
    const $o = load(ordered);
    expect($o("ol").length).toBe(1);
    expect($o("ol").attr("data-block-id")).toMatch(HEX_BLOCK_ID);
  });

  it("uses empty paragraph when markdown is empty or whitespace-only", () => {
    for (const input of ["", "   ", "\n\t\n"]) {
      const html = convertMarkdownToBlockHtml(input);
      const $ = load(html);

      expect($("p").length).toBeGreaterThanOrEqual(1);
      expect(
        $(`div[data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"]`).length
      ).toBe(1);
    }
  });

  it("produces valid nested structure: root > blocks without extra wrappers", () => {
    const html = convertMarkdownToBlockHtml("Line");
    const $ = load(html);

    const root = $(
      `div[data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"]`
    ).first();
    expect(root.children("p").length).toBe(1);
    expect(root.find("p").first().text()).toContain("Line");
  });

  it("handles fenced code blocks and strips classes from code/pre", () => {
    const html = convertMarkdownToBlockHtml("```\nconst x = 1\n```");
    const $ = load(html);

    expect($("pre").length).toBe(1);
    expect($("pre code, code").length).toBeGreaterThanOrEqual(1);
    expect($("pre[class], code[class]").length).toBe(0);
  });

  it("renders inline emphasis and strong without presentation attributes on spans", () => {
    const html = convertMarkdownToBlockHtml("Some *italic* and **bold** text.");
    const $ = load(html);

    expect($("em").length).toBe(1);
    expect($("strong").length).toBe(1);
    expect($("em[class], strong[class]").length).toBe(0);
  });
});
