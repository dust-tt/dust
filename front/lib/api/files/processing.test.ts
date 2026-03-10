import {
  hasProcessedVersion,
  isUploadSupportedForContentType,
} from "@app/lib/api/files/processing";
import { describe, expect, it } from "vitest";

describe("hasProcessedVersion", () => {
  it("should return false for plain text files", () => {
    expect(hasProcessedVersion("text/plain")).toBe(false);
  });

  it("should return false for Python files", () => {
    expect(hasProcessedVersion("text/x-python")).toBe(false);
  });

  it("should return false for JSON files", () => {
    expect(hasProcessedVersion("application/json")).toBe(false);
  });

  it("should return false for CSV files", () => {
    expect(hasProcessedVersion("text/csv")).toBe(false);
  });

  it("should return false for SVG files", () => {
    expect(hasProcessedVersion("image/svg+xml")).toBe(false);
  });

  it("should return true for PDF files (text extraction)", () => {
    expect(hasProcessedVersion("application/pdf")).toBe(true);
  });

  it("should return true for Word documents (text extraction)", () => {
    expect(
      hasProcessedVersion(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe(true);
  });

  it("should return true for image files (resize)", () => {
    expect(hasProcessedVersion("image/png")).toBe(true);
  });

  it("should return true for Excel files (text extraction)", () => {
    expect(
      hasProcessedVersion(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    ).toBe(true);
  });

  it("should return true for audio files (transcription)", () => {
    expect(hasProcessedVersion("audio/mpeg")).toBe(true);
  });
});

describe("isUploadSupportedForContentType", () => {
  it("should return true for plain text files (uploadable without processing)", () => {
    expect(
      isUploadSupportedForContentType({
        contentType: "text/plain",
        useCase: "conversation",
      })
    ).toBe(true);
  });

  it("should return true for Python files (uploadable without processing)", () => {
    expect(
      isUploadSupportedForContentType({
        contentType: "text/x-python",
        useCase: "conversation",
      })
    ).toBe(true);
  });

  it("should return true for CSV files (uploadable without processing)", () => {
    expect(
      isUploadSupportedForContentType({
        contentType: "text/csv",
        useCase: "conversation",
      })
    ).toBe(true);
  });

  it("should return true for PDF files (uploadable with processing)", () => {
    expect(
      isUploadSupportedForContentType({
        contentType: "application/pdf",
        useCase: "conversation",
      })
    ).toBe(true);
  });

  it("should return true for SVG files in conversation", () => {
    expect(
      isUploadSupportedForContentType({
        contentType: "image/svg+xml",
        useCase: "conversation",
      })
    ).toBe(true);
  });

  it("should return true for image files as skill_attachment", () => {
    expect(
      isUploadSupportedForContentType({
        contentType: "image/png",
        useCase: "skill_attachment",
      })
    ).toBe(true);
  });

  it("should return true for Slack thread attachments", () => {
    expect(
      isUploadSupportedForContentType({
        contentType: "text/vnd.dust.attachment.slack.thread",
        useCase: "conversation",
      })
    ).toBe(true);
  });

  it("should return true for section JSON as tool_output", () => {
    expect(
      isUploadSupportedForContentType({
        contentType: "application/vnd.dust.section.json",
        useCase: "tool_output",
      })
    ).toBe(true);
  });

  it("should return false for unsupported content type / use case combo", () => {
    expect(
      isUploadSupportedForContentType({
        contentType: "image/png",
        useCase: "upsert_table",
      })
    ).toBe(false);
  });
});
