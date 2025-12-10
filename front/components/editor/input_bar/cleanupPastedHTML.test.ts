import { describe, expect, test } from "vitest";

import { cleanupPastedHTML } from "./cleanupPastedHTML";

describe("cleanupPastedHTML", () => {
  describe("allowed tags", () => {
    test("preserves basic text formatting tags", () => {
      const html = "<p>Hello <strong>world</strong> and <em>universe</em></p>";
      const result = cleanupPastedHTML(html);
      expect(result).toBe(
        "<p>Hello <strong>world</strong> and <em>universe</em></p>"
      );
    });

    test("preserves links", () => {
      const html = '<a href="https://example.com">Link</a>';
      const result = cleanupPastedHTML(html);
      expect(result).toContain("<a");
      expect(result).toContain("https://example.com");
      expect(result).toContain("Link");
    });
  });

  describe("forbidden tags removal", () => {
    test("removes script tags but keeps content", () => {
      const html = "<p>Before</p><script>alert('xss')</script><p>After</p>";
      const result = cleanupPastedHTML(html);
      expect(result).toBe("<p>Before</p><p>After</p>");
    });

    test("removes style tags", () => {
      const html = "<style>body { color: red; }</style><p>Text</p>";
      const result = cleanupPastedHTML(html);
      expect(result).toBe("<p>Text</p>");
    });

    test("removes iframe tags", () => {
      const html = '<iframe src="https://evil.com"></iframe><p>Safe</p>';
      const result = cleanupPastedHTML(html);
      expect(result).toBe("<p>Safe</p>");
    });

    test("removes form elements", () => {
      const html =
        '<form><input type="text"><button>Submit</button></form><p>Text</p>';
      const result = cleanupPastedHTML(html);
      expect(result).toBe("Submit<p>Text</p>");
    });

    test("removes video and audio tags", () => {
      const html =
        '<video src="video.mp4"></video><audio src="audio.mp3"></audio><p>Content</p>';
      const result = cleanupPastedHTML(html);
      expect(result).toBe("<p>Content</p>");
    });

    test("removes SVG tags", () => {
      const html = '<svg><circle cx="50" cy="50" r="40"/></svg><p>Text</p>';
      const result = cleanupPastedHTML(html);
      expect(result).toBe("<p>Text</p>");
    });

    test("removes object and embed tags", () => {
      const html =
        '<object data="file.pdf"></object><embed src="file.swf"><p>Safe</p>';
      const result = cleanupPastedHTML(html);
      expect(result).toBe("<p>Safe</p>");
    });

    test("removes template tags", () => {
      const html = "<template><p>Template content</p></template><p>Visible</p>";
      const result = cleanupPastedHTML(html);
      expect(result).toBe("<p>Visible</p>");
    });

    test("removes link and meta tags", () => {
      const html =
        '<link rel="stylesheet" href="style.css"><meta charset="utf-8"><p>Content</p>';
      const result = cleanupPastedHTML(html);
      expect(result).toBe("<p>Content</p>");
    });
  });

  describe("forbidden attributes removal", () => {
    test("removes style attributes", () => {
      const html = '<p style="color: red; font-size: 20px;">Text</p>';
      const result = cleanupPastedHTML(html);
      expect(result).toBe("<p>Text</p>");
    });

    test("removes class attributes", () => {
      const html = '<div class="container main-content">Text</div>';
      const result = cleanupPastedHTML(html);
      expect(result).toBe("<div>Text</div>");
    });

    test("removes id attributes", () => {
      const html = '<span id="unique-id">Content</span>';
      const result = cleanupPastedHTML(html);
      expect(result).toBe("<span>Content</span>");
    });
  });

  describe("data attributes preservation", () => {
    test("preserves data-* attributes", () => {
      const html = '<div data-id="123" data-type="user">Content</div>';
      const result = cleanupPastedHTML(html);
      expect(result).toBe('<div data-id="123" data-type="user">Content</div>');
    });
  });

  test("handles malformed HTML", () => {
    const html = "<p>Unclosed paragraph<div>Mixed <span>nesting</div></span>";
    const result = cleanupPastedHTML(html);
    // DOMPurify should fix malformed HTML
    expect(result).toBe(
      "<p>Unclosed paragraph</p><div>Mixed <span>nesting</span></div>"
    );
  });

  test("handles HTML from google docs", () => {
    const html = `
<html>
<head>
    <meta http-equiv="content-type" content="text/html; charset=utf-8">
</head>
<body>
<meta charset="utf-8">
<h2 dir="ltr" style="line-height:1.38;margin-top:18pt;margin-bottom:6pt;"
    id="docs-internal-guid-0a5ee12a-7fff-28b9-6d39-e8f41357f7f9"><span
        style="font-size:16pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">&lt;h2&gt; hello you &lt;h2/&gt;</span>
</h2><br/>
<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span
        style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Hello </span><span
        style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:700;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">this is</span><span
        style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;"> me and I&rsquo;m in </span><span
        style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:italic;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">italic</span>
</p>
<h1 dir="ltr" style="line-height:1.38;margin-top:20pt;margin-bottom:6pt;"><span
        style="font-size:20pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">&lt;H2&gt; totot &lt;/H2&gt;</span>
</h1><br/>
<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span
        style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:700;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Again bold </span><span
        style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">and not bold</span>
</p></body>
</html>`;
    const result = cleanupPastedHTML(html);
    // DOMPurify should fix malformed HTML
    expect(result).toBe(
      `


<h2 dir="ltr"><span>&lt;h2&gt; hello you &lt;h2/&gt;</span>
</h2><br>
<p dir="ltr"><span>Hello </span><span><strong>this is</strong></span><span> me and I’m in </span><span><em>italic</em></span>
</p>
<h1 dir="ltr"><span>&lt;H2&gt; totot &lt;/H2&gt;</span>
</h1><br>
<p dir="ltr"><span><strong>Again bold </strong></span><span>and not bold</span>
</p>
`
    );
  });

  test("html from google doc in chrome", () => {
    const html = `<meta charset='utf-8'><meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-d522e2d0-7fff-389d-e6ca-8dcec5a664f4"><h2 dir="ltr" style="line-height:1.38;margin-top:18pt;margin-bottom:6pt;"><span style="font-size:16pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">&lt;h2&gt; hello you &lt;h2/&gt;</span></h2><br /><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Hello </span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:700;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">this is</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;"> me and I&rsquo;m in </span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:italic;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">italic</span></p><h1 dir="ltr" style="line-height:1.38;margin-top:20pt;margin-bottom:6pt;"><span style="font-size:20pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">&lt;H2&gt; totot &lt;/H2&gt;</span></h1><br /><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:700;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Again bold </span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">and not bold</span></p></b><br class="Apple-interchange-newline">`;
    const result = cleanupPastedHTML(html);
    expect(result).toBe(
      `<span><h2 dir="ltr"><span>&lt;h2&gt; hello you &lt;h2/&gt;</span></h2><br><p dir="ltr"><span>Hello </span><span><strong>this is</strong></span><span> me and I’m in </span><span><em>italic</em></span></p><h1 dir="ltr"><span>&lt;H2&gt; totot &lt;/H2&gt;</span></h1><br><p dir="ltr"><span><strong>Again bold </strong></span><span>and not bold</span></p></span>`
    );
  });
});
