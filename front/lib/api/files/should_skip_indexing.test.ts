import { shouldSkipDataSourceIndexing } from "@app/lib/api/files/should_skip_indexing";
import { describe, expect, it } from "vitest";

describe("shouldSkipDataSourceIndexing", () => {
  it("skips pasted text attachments", () => {
    expect(
      shouldSkipDataSourceIndexing({
        contentType: "text/vnd.dust.attachment.pasted",
        fileName: "pasted-text-1_2026-04-23_10-00-00.txt",
      })
    ).toBe(true);
  });

  it("skips Slack thread attachments", () => {
    expect(
      shouldSkipDataSourceIndexing({
        contentType: "text/vnd.dust.attachment.slack.thread",
        fileName: "thread.txt",
      })
    ).toBe(true);
  });

  it("skips Chrome extension page captures by filename prefix", () => {
    expect(
      shouldSkipDataSourceIndexing({
        contentType: "text/markdown",
        fileName: "[text] example.com — page title.md",
      })
    ).toBe(true);
  });

  it("skips audio/webm (voice recording)", () => {
    expect(
      shouldSkipDataSourceIndexing({
        contentType: "audio/webm",
        fileName: "recording.webm",
      })
    ).toBe(true);
  });

  it("does not skip regular text files", () => {
    expect(
      shouldSkipDataSourceIndexing({
        contentType: "text/plain",
        fileName: "notes.txt",
      })
    ).toBe(false);
  });

  it("does not skip regular markdown files", () => {
    expect(
      shouldSkipDataSourceIndexing({
        contentType: "text/markdown",
        fileName: "README.md",
      })
    ).toBe(false);
  });

  it("does not skip audio/mpeg (only audio/webm is handled)", () => {
    expect(
      shouldSkipDataSourceIndexing({
        contentType: "audio/mpeg",
        fileName: "podcast.mp3",
      })
    ).toBe(false);
  });

  it("does not skip files whose name merely contains [text] without the prefix", () => {
    expect(
      shouldSkipDataSourceIndexing({
        contentType: "text/markdown",
        fileName: "notes about [text] stuff.md",
      })
    ).toBe(false);
  });

  it("does not skip webhook_body JSON payloads (handled by temporal stamp, not this helper)", () => {
    expect(
      shouldSkipDataSourceIndexing({
        contentType: "application/json",
        fileName: "webhook_body_123_456.json",
      })
    ).toBe(false);
  });
});
