import * as esm from "@dust-tt/sparkle/document";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const commonJS = require("@dust-tt/sparkle/document");

for (const [name, documentAPI] of Object.entries({ esm, commonJS })) {
  test(`${name} document entry parses and serializes without a DOM`, () => {
    assert.equal(typeof window, "undefined");
    assert.equal(typeof document, "undefined");

    const markdown = '# A document\n\n[Link](https://dust.tt "Dust")';
    const parsed = documentAPI.parseDocumentContent(markdown, "markdown");
    assert.equal(parsed.ok, true);
    assert.equal(
      documentAPI.serializeDocumentMarkdown(parsed.content),
      markdown
    );
    assert.deepEqual(
      documentAPI.parseDocumentContent(JSON.stringify(parsed.content), "json"),
      parsed
    );
    assert.equal(
      documentAPI.parseDocumentContent(
        '{"type":"doc","content":[{"type":"iframe"}]}',
        "json"
      ).ok,
      false
    );
  });
}

for (const [name, documentAPI] of Object.entries({ esm, commonJS })) {
  test(`${name} preserves named visuals and rejects executable attributes`, () => {
    const content = { type: "doc", content: [{ type: "dustVisual", attrs: { name: "revenue" } }] };
    const parsed = documentAPI.parseDocumentContent(JSON.stringify(content), "json");
    assert.equal(parsed.ok, true);
    assert.equal(documentAPI.serializeDocumentMarkdown(parsed.content), null);
    const invalid = { type: "doc", content: [{ type: "dustVisual", attrs: { name: "revenue", code: "alert(1)" } }] };
    assert.equal(documentAPI.parseDocumentContent(JSON.stringify(invalid), "json").ok, false);
  });
}
