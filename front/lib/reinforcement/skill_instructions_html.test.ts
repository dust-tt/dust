import { convertMarkdownToBlockHtml } from "@app/lib/reinforcement/skill_instructions_html";
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

  it("handles fenced code blocks and strips classes from pre only", () => {
    const html = convertMarkdownToBlockHtml("```\nconst x = 1\n```");
    const $ = load(html);

    expect($("pre").length).toBe(1);
    expect($("pre code, code").length).toBeGreaterThanOrEqual(1);
    expect($("pre[class]").length).toBe(0);
  });

  it("renders inline emphasis and strong without presentation attributes on spans", () => {
    const html = convertMarkdownToBlockHtml("Some *italic* and **bold** text.");
    const $ = load(html);

    expect($("em").length).toBe(1);
    expect($("strong").length).toBe(1);
    expect($("em[class], strong[class]").length).toBe(0);
  });

  it("recovers standalone <knowledge /> lines as knowledge nodes (not HTML-escaped text)", () => {
    const md = [
      "Intro",
      "",
      '<knowledge id="n1" title="My Doc" space="sp1" dsv="dsv1" hasChildren="false" />',
      "",
      "Outro",
    ].join("\n");

    const html = convertMarkdownToBlockHtml(md);

    expect(html).not.toContain("&lt;knowledge");
    expect(html).toContain("<knowledge");
    expect(html).toContain('id="n1"');
    expect(html).toContain('title="My Doc"');
  });

  it("recovers standalone <tool /> lines as tool nodes with id, name, and icon", () => {
    const md = [
      "Intro",
      "",
      '<tool id="mcp_server_view_1" name="GitHub Search" icon="GithubLogo" />',
      "",
      "Outro",
    ].join("\n");

    const html = convertMarkdownToBlockHtml(md);

    expect(html).not.toContain("&lt;tool");
    expect(html).toContain("<tool");
    expect(html).toContain('id="mcp_server_view_1"');
    expect(html).toContain('name="GitHub Search"');
    expect(html).toContain('icon="GithubLogo"');
  });

  it("renders inline <skill /> references as skill nodes (not HTML-escaped text)", () => {
    const md =
      '<skill id="skl_abc" name="Talk Like a Pirate" icon="ActionSpeakIcon" /> when in doubt';

    const html = convertMarkdownToBlockHtml(md);
    const $ = load(html);

    expect(html).not.toContain("&lt;skill");

    const skill = $("skill");
    expect(skill).toHaveLength(1);
    expect(skill.attr("id")).toBe("skl_abc");
    expect(skill.attr("name")).toBe("Talk Like a Pirate");
    expect(skill.attr("icon")).toBe("ActionSpeakIcon");
    // The boolean parse-only attribute must not leak into the HTML.
    expect(skill.attr("skillunavailable")).toBeUndefined();

    // The trailing text must remain a sibling of the skill node, not get
    // swallowed inside a self-closed <skill> element.
    expect(skill.text()).not.toContain("when in doubt");
    const paragraph = skill.parent("p");
    expect(paragraph).toHaveLength(1);
    expect(paragraph.text()).toContain("when in doubt");
  });

  it("recovers standalone <skill /> lines as skill nodes with id, name, and icon", () => {
    const md = [
      "Intro",
      "",
      '<skill id="skl_def" name="Triage Support" icon="ActionListIcon" />',
      "",
      "Outro",
    ].join("\n");

    const html = convertMarkdownToBlockHtml(md);

    expect(html).not.toContain("&lt;skill");
    expect(html).toContain("<skill");
    expect(html).toContain('id="skl_def"');
    expect(html).toContain('name="Triage Support"');
    expect(html).toContain('icon="ActionListIcon"');
  });

  it("renders <unavailable_skill /> references preserving the id and keeping trailing text", () => {
    const md = '<unavailable_skill id="skl_gone" /> for legacy callers';

    const html = convertMarkdownToBlockHtml(md);
    const $ = load(html);

    expect(html).not.toContain("&lt;unavailable_skill");

    const skill = $("unavailable_skill");
    expect(skill).toHaveLength(1);
    expect(skill.attr("id")).toBe("skl_gone");

    expect(skill.text()).not.toContain("for legacy callers");
    expect(skill.parent("p").text()).toContain("for legacy callers");
  });
});
