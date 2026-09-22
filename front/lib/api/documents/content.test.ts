// @vitest-environment node

import {
  decodeNativeDocumentSource,
  exportDocumentMarkdown,
  importDocumentMarkdown,
  parseNativeDocument,
  validateNativeDocument,
} from "@app/lib/api/documents/content";
import { DOCUMENT_MAX_BYTES, NativeDocumentSchema } from "@app/types/documents";
import { describe, expect, it } from "vitest";

const envelope = (content: unknown) => ({
  format: "dust-document",
  formatVersion: 1,
  schemaVersion: 1,
  content,
});

const visual = { type: "dustVisual", attrs: { name: "revenue" } };

describe("native document content", () => {
  it("decodes bounded UTF-8 without silently replacing invalid bytes", () => {
    const source = '"Résumé"';
    const decoded = decodeNativeDocumentSource(Buffer.from(source));
    expect(decoded.isOk() && decoded.value).toBe(source);
    const invalid = decodeNativeDocumentSource(Buffer.from([0xff]));
    expect(invalid.isErr() && invalid.error.message).toContain("UTF-8");
    const oversized = decodeNativeDocumentSource(
      Buffer.alloc(DOCUMENT_MAX_BYTES + 1)
    );
    expect(oversized.isErr() && oversized.error.message).toContain("512 KiB");
    const bom = decodeNativeDocumentSource(Buffer.from("\uFEFF{}"));
    expect(bom.isOk() && bom.value).toBe("\uFEFF{}");
  });

  it("validates rich text and named visuals without rewriting the content", () => {
    const input = envelope({ type: "doc", content: [visual] });
    const parsed = parseNativeDocument(JSON.stringify(input));
    expect(parsed).toEqual(input);
    expect(parsed && exportDocumentMarkdown(parsed)).toBeNull();

    const prose = importDocumentMarkdown("# Brief\n\nA **clear** next step.");
    expect(prose).not.toBeNull();
    expect(prose && exportDocumentMarkdown(prose)).toContain("**clear**");
    expect(importDocumentMarkdown("<script>alert(1)</script>")).toBeNull();
  });

  it("rejects unknown envelope and content fields, including prototype keys", () => {
    const valid = envelope({ type: "doc", content: [{ type: "paragraph" }] });
    for (const input of [
      { ...valid, formatVersion: 2 },
      { ...valid, schemaVersion: 2 },
      { ...valid, unexpected: true },
      envelope({ type: "doc", content: [{ type: "script" }] }),
      envelope({ type: "doc", content: [{ type: "paragraph", secret: true }] }),
      envelope({
        type: "doc",
        content: [
          {
            ...visual,
            attrs: { ...visual.attrs, sandbox: "allow-same-origin" },
          },
        ],
      }),
    ]) {
      expect(parseNativeDocument(JSON.stringify(input))).toBeNull();
    }

    const source = JSON.stringify(valid).replace(
      '"type":"doc"',
      '"type":"doc","__proto__":{"hidden":true}'
    );
    const preserved = NativeDocumentSchema.parse(JSON.parse(source));
    expect(Object.hasOwn(preserved.content, "__proto__")).toBe(true);
    expect(parseNativeDocument(source)).toBeNull();
    expect(
      parseNativeDocument(
        JSON.stringify(valid).replace(
          '"format":"dust-document"',
          '"format":"dust-document","__proto__":{"hidden":true}'
        )
      )
    ).toBeNull();
  });

  it("uses the shared editor's visual validation", () => {
    for (const name of [
      "https://example.com/visual",
      "/files/pod-abc123/Revenue/manifest.json",
      "pod-abc123/../Revenue/manifest.json",
      "pod-abc123/Revenue//manifest.json",
    ]) {
      expect(
        parseNativeDocument(
          JSON.stringify(
            envelope({
              type: "doc",
              content: [{ ...visual, attrs: { ...visual.attrs, name } }],
            })
          )
        )
      ).toBeNull();
    }
    expect(
      parseNativeDocument(
        JSON.stringify(
          envelope({
            type: "doc",
            content: Array.from({ length: 11 }, () => visual),
          })
        )
      )
    ).toBeNull();
  });

  it("rejects oversized UTF-8 and deeply nested JSON without throwing", () => {
    const oversized = JSON.stringify(
      envelope({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "é".repeat(DOCUMENT_MAX_BYTES / 2) },
            ],
          },
        ],
      })
    );
    expect(oversized.length).toBeLessThan(DOCUMENT_MAX_BYTES);
    expect(validateNativeDocument(oversized).isErr()).toBe(true);

    const deepContent =
      '{"type":"doc","content":[' +
      '{"type":"blockquote","content":['.repeat(12_000) +
      '{"type":"paragraph"}' +
      "]}".repeat(12_000) +
      "]}";
    const source =
      '{"format":"dust-document","formatVersion":1,"schemaVersion":1,"content":' +
      deepContent +
      "}";
    expect(source.length).toBeLessThan(DOCUMENT_MAX_BYTES);
    expect(parseNativeDocument(source)).toBeNull();
    expect(parseNativeDocument("{")).toBeNull();
  });
});
