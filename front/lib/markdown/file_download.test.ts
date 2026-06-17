import { describe, expect, it } from "vitest";

import {
  getDownloadContentType,
  getFileDownloadMarkdownDirective,
  getFileDownloadTypeLabel,
} from "./file_download";

describe("getFileDownloadMarkdownDirective", () => {
  it("infers the title from the scoped path", () => {
    expect(
      getFileDownloadMarkdownDirective({
        path: "conversation-c1/exports/data.csv",
      })
    ).toBe(
      '::download_file{path="conversation-c1/exports/data.csv" title="data.csv"}'
    );
  });

  it("escapes directive attributes and strips newlines", () => {
    expect(
      getFileDownloadMarkdownDirective({
        contentType: "application/pdf",
        path: 'conversation-c1/reports/report "Q2"\nfinal.pdf',
        title: 'report "Q2"\rfinal.pdf',
      })
    ).toBe(
      '::download_file{path="conversation-c1/reports/report &quot;Q2&quot; final.pdf" title="report &quot;Q2&quot; final.pdf" contentType="application/pdf"}'
    );
  });
});

describe("getDownloadContentType", () => {
  it("strips MIME parameters and falls back to file extension", () => {
    expect(
      getDownloadContentType({
        contentType: "application/pdf; charset=utf-8",
        fileName: "report.pdf",
      })
    ).toBe("application/pdf");
    expect(getDownloadContentType({ fileName: "data.csv" })).toBe("text/csv");
    expect(getDownloadContentType({ fileName: "README" })).toBe(
      "application/octet-stream"
    );
  });
});

describe("getFileDownloadTypeLabel", () => {
  it("prefers the file extension and falls back to content type", () => {
    expect(
      getFileDownloadTypeLabel({
        contentType: "application/pdf",
        fileName: "report.final",
      })
    ).toBe("FINAL");
    expect(
      getFileDownloadTypeLabel({
        contentType: "application/pdf",
        fileName: "report",
      })
    ).toBe("PDF");
    expect(getFileDownloadTypeLabel({ fileName: "report" })).toBe("File");
  });
});
