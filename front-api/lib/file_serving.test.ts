import {
  contentDispositionAttachment,
  isContentTypeSafeToDisplay,
} from "@front-api/lib/file_serving";
import { describe, expect, it } from "vitest";

describe("isContentTypeSafeToDisplay", () => {
  it("returns true for safe image types", () => {
    expect(isContentTypeSafeToDisplay("image/png")).toBe(true);
    expect(isContentTypeSafeToDisplay("image/jpeg")).toBe(true);
    expect(isContentTypeSafeToDisplay("image/webp")).toBe(true);
    expect(isContentTypeSafeToDisplay("image/gif")).toBe(true);
  });

  it("returns true for other safe types", () => {
    expect(isContentTypeSafeToDisplay("application/pdf")).toBe(true);
    expect(isContentTypeSafeToDisplay("text/csv")).toBe(true);
    expect(isContentTypeSafeToDisplay("application/json")).toBe(true);
  });

  it("returns false for SVG", () => {
    expect(isContentTypeSafeToDisplay("image/svg+xml")).toBe(false);
  });

  it("returns false for HTML", () => {
    expect(isContentTypeSafeToDisplay("text/html")).toBe(false);
  });

  it("returns false for EML", () => {
    expect(isContentTypeSafeToDisplay("message/rfc822")).toBe(false);
  });

  it("returns false for unknown types", () => {
    expect(isContentTypeSafeToDisplay("application/octet-stream")).toBe(false);
    expect(isContentTypeSafeToDisplay("application/x-unknown")).toBe(false);
  });

  it("strips mime parameters before lookup", () => {
    expect(isContentTypeSafeToDisplay("image/png; charset=utf-8")).toBe(true);
    expect(isContentTypeSafeToDisplay("image/svg+xml; charset=utf-8")).toBe(
      false
    );
  });
});

describe("contentDispositionAttachment", () => {
  it("produces a valid attachment header for ASCII filenames", () => {
    expect(contentDispositionAttachment("report.pdf")).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`
    );
  });

  it("replaces non-ASCII characters in the fallback and percent-encodes in filename*", () => {
    const result = contentDispositionAttachment("rapport_été.pdf");
    expect(result).toContain(`filename="rapport__t_.pdf"`);
    expect(result).toContain(`filename*=UTF-8''rapport_%C3%A9t%C3%A9.pdf`);
  });

  it("handles filenames with spaces", () => {
    const result = contentDispositionAttachment("my file.pdf");
    expect(result).toContain(`filename="my file.pdf"`);
    expect(result).toContain(`filename*=UTF-8''my%20file.pdf`);
  });
});
