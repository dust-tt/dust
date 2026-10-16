import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  formatDiffstat,
  formatPullRequestExcerpt,
  formatPullRequestPreview,
  type PullRequestSummary,
} from "./pr-preview.ts";

const PR: PullRequestSummary = {
  number: 35240,
  title: "[front] Add a <banner> & more",
  body: "## Description\r\n\r\nAdds a **banner**.\r\n\r\n## Tests\r\n\r\nManual.",
  html_url: "https://github.com/dust-tt/dust/pull/35240",
  state: "open",
  draft: false,
  merged: false,
  user: { login: "sfriquet", avatar_url: "https://avatars.example/u/1" },
  head: { ref: "sf/banner" },
  base: { ref: "main", repo: { full_name: "dust-tt/dust" } },
  labels: [{ name: "PMRR" }],
  additions: 1243,
  deletions: 13,
  changed_files: 4,
  comments: 2,
  review_comments: 1,
  created_at: "2026-10-16T10:59:13Z",
};

describe("formatPullRequestExcerpt", () => {
  it("keeps only the Description section of the PR template", () => {
    assert.equal(formatPullRequestExcerpt(PR.body), "Adds a *banner*.");
  });

  it("uses the whole body without a Description section", () => {
    assert.equal(formatPullRequestExcerpt("Just a fix."), "Just a fix.");
  });

  it("converts Markdown to Slack mrkdwn", () => {
    assert.equal(
      formatPullRequestExcerpt(
        [
          "### Why",
          "- *Italic* and __bold__ and ~~gone~~",
          "- [ ] see [docs](https://dust.tt/docs?a=1&b=2) and `a*b*c`",
        ].join("\n")
      ),
      [
        "*Why*",
        "• _Italic_ and *bold* and ~gone~",
        "• see <https://dust.tt/docs?a=1&amp;b=2|docs> and `a*b*c`",
      ].join("\n")
    );
  });

  it("drops comments, images, HTML, code blocks, and review requests", () => {
    assert.equal(
      formatPullRequestExcerpt(
        [
          "<!-- template -->",
          "Before",
          '<img src="https://x/y.png" />',
          "![shot](https://x/y.png)",
          "```ts",
          "const a = 1;",
          "```",
          "r? @spolu",
          "After",
        ].join("\n")
      ),
      "Before\n\nAfter"
    );
  });

  it("never emits Slack control sequences from the body", () => {
    const excerpt = formatPullRequestExcerpt(
      "<!channel> <@U123> [ping](!here) [x](javascript:alert) a & b"
    );
    assert.equal(excerpt, "&lt;!channel&gt; &lt;@U123&gt; ping x a &amp; b");
    assert.doesNotMatch(excerpt, /<[!@]/);
  });

  it("truncates long descriptions without breaking links", () => {
    const excerpt = formatPullRequestExcerpt(
      `${"word ".repeat(95)}[link](https://dust.tt/${"a".repeat(80)})`
    );
    assert.ok(excerpt.length <= 501);
    assert.ok(excerpt.endsWith("…"));
    assert.doesNotMatch(excerpt, /<[^>]*$/);
  });

  it("truncates descriptions with too many lines", () => {
    const excerpt = formatPullRequestExcerpt(
      Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n")
    );
    assert.equal(excerpt.split("\n").length, 8);
    assert.ok(excerpt.endsWith("line 7…"));
  });
});

describe("formatDiffstat", () => {
  it("splits five squares between additions and deletions", () => {
    assert.equal(
      formatDiffstat(30, 20),
      ":large_green_square:".repeat(3) + ":large_red_square:".repeat(2)
    );
  });

  it("keeps a square for small sides and grey squares when empty", () => {
    assert.equal(
      formatDiffstat(1243, 13),
      ":large_green_square:".repeat(4) + ":large_red_square:"
    );
    assert.equal(formatDiffstat(0, 0), ":white_large_square:".repeat(5));
  });
});

describe("formatPullRequestPreview", () => {
  it("renders a GitHub-like preview of an open PR", () => {
    const { color, blocks } = formatPullRequestPreview(PR);
    assert.equal(color, "#1f883d");
    assert.deepEqual(blocks, [
      {
        type: "context",
        elements: [
          {
            type: "image",
            image_url: "https://avatars.example/u/1",
            alt_text: "sfriquet",
          },
          { type: "mrkdwn", text: "*sfriquet*" },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*<https://github.com/dust-tt/dust/pull/35240|#35240 [front] Add a &lt;banner&gt; &amp; more>*",
        },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: "Adds a *banner*." },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text:
              "*Open*  ·  `+1,243` `−13` " +
              ":large_green_square:".repeat(4) +
              ":large_red_square:  ·  4 files  ·  `sf/banner` → `main`" +
              "  ·  :speech_balloon: 3  ·  `PMRR`",
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "image",
            image_url: "https://github.githubassets.com/favicons/favicon.png",
            alt_text: "GitHub",
          },
          {
            type: "mrkdwn",
            text: "dust-tt/dust  ·  <!date^1792148353^{date_short_pretty}|2026-10-16>",
          },
        ],
      },
    ]);
  });

  it("colors the side bar by state", () => {
    const color = (pr: Partial<PullRequestSummary>) =>
      formatPullRequestPreview({ ...PR, ...pr }).color;
    assert.equal(color({ draft: true }), "#59636e");
    assert.equal(color({ state: "closed", merged: true }), "#8250df");
    assert.equal(color({ state: "closed" }), "#cf222e");
  });

  it("omits the excerpt, comments, and labels when empty", () => {
    const { blocks } = formatPullRequestPreview({
      ...PR,
      body: null,
      labels: [],
      comments: 0,
      review_comments: 0,
      changed_files: 1,
    });
    assert.equal(blocks.length, 4);
    assert.doesNotMatch(JSON.stringify(blocks), /speech_balloon|PMRR|files/);
  });
});

describe("formatPullRequestPreview with an untouched template", () => {
  it("omits the excerpt block", () => {
    const body = readFileSync(
      new URL("../../pull_request_template.md", import.meta.url),
      "utf8"
    );
    assert.equal(formatPullRequestExcerpt(body), "");
    assert.equal(formatPullRequestPreview({ ...PR, body }).blocks.length, 4);
  });
});
