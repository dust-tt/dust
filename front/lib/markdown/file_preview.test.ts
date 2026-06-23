import { describe, expect, it } from "vitest";

import {
  getFilePreviewContentType,
  getFilePreviewMarkdownDirective,
  getFilePreviewTypeLabel,
  parseFilePreviewMarkdownDirective,
} from "./file_preview";

describe("getFilePreviewMarkdownDirective", () => {
  it("infers the title from the scoped path", () => {
    expect(
      getFilePreviewMarkdownDirective({
        path: "conversation-c1/exports/data.csv",
      })
    ).toBe(
      ':preview_file{path="conversation-c1/exports/data.csv" title="data.csv"}'
    );
  });

  it("escapes directive attributes and strips newlines", () => {
    expect(
      getFilePreviewMarkdownDirective({
        contentType: "application/pdf",
        path: 'conversation-c1/reports/report "Q2"\nfinal.pdf',
        title: 'report "Q2"\rfinal.pdf',
      })
    ).toBe(
      ':preview_file{path="conversation-c1/reports/report &quot;Q2&quot; final.pdf" title="report &quot;Q2&quot; final.pdf" contentType="application/pdf"}'
    );
  });

  it("round-trips through parseFilePreviewMarkdownDirective", () => {
    const directive = getFilePreviewMarkdownDirective({
      contentType: "application/pdf",
      path: "conversation-c1/booklet.pdf",
      title: "booklet.pdf",
    });

    expect(parseFilePreviewMarkdownDirective(directive)).toEqual({
      contentType: "application/pdf",
      path: "conversation-c1/booklet.pdf",
      raw: directive,
      title: "booklet.pdf",
    });
  });
});

describe("getFilePreviewContentType", () => {
  it("strips MIME parameters and falls back to file extension", () => {
    expect(
      getFilePreviewContentType({
        contentType: "application/pdf; charset=utf-8",
        fileName: "report.pdf",
      })
    ).toBe("application/pdf");
    expect(getFilePreviewContentType({ fileName: "data.csv" })).toBe(
      "text/csv"
    );
    expect(getFilePreviewContentType({ fileName: "README" })).toBe(
      "application/octet-stream"
    );
  });
});

describe("getFilePreviewTypeLabel", () => {
  it("prefers the file extension and falls back to content type", () => {
    expect(
      getFilePreviewTypeLabel({
        contentType: "application/pdf",
        fileName: "report.final",
      })
    ).toBe("FINAL");
    expect(
      getFilePreviewTypeLabel({
        contentType: "application/pdf",
        fileName: "report",
      })
    ).toBe("PDF");
    expect(getFilePreviewTypeLabel({ fileName: "report" })).toBe("File");
  });
});
