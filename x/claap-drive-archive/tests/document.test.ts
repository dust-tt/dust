import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { buildArchiveMarkdown, formatTranscript } from "../src/document.ts";
import { makeRecording, makeTranscript } from "./fixtures.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("document", () => {
  it("puts recorder and participant metadata above the raw transcript", () => {
    const markdown = buildArchiveMarkdown({
      recording: makeRecording(),
      transcript: makeTranscript(),
    });

    assert.match(markdown, /^---\n/);
    assert.match(markdown, /claap_id: rec_abc123/);
    assert.match(markdown, /recorder_name: "Ilias Bettaieb"/);
    assert.match(markdown, /recorder_email: ilias@dust\.tt/);
    assert.match(markdown, /meeting_type: external/);
    assert.match(markdown, /email: jane@acme\.com/);
    assert.match(markdown, /# Transcript\n\n\[00:02:16\] speaker_1: Hello there!/);
    assert.match(markdown, /\[00:02:18\] speaker_2: Thanks for joining\./);
  });

  it("does not copy generated notes into the markdown archive", () => {
    const markdown = buildArchiveMarkdown({
      recording: makeRecording(),
      transcript: makeTranscript(),
    });

    assert.doesNotMatch(markdown, /MEDICC/);
    assert.doesNotMatch(markdown, /Generated notes must stay out/);
    assert.doesNotMatch(markdown, /Do not put this in the markdown/);
  });

  it("matches the checked-in sample document", () => {
    const markdown = buildArchiveMarkdown({
      recording: makeRecording(),
      transcript: makeTranscript(),
    });
    const sample = readFileSync(join(here, "../examples/sample-archive.md"), "utf8");
    assert.equal(markdown, sample);
  });

  it("explains when no transcript exists", () => {
    assert.equal(
      formatTranscript({ languageCode: "en", segments: [] }),
      "_No transcript was available for this recording._"
    );
  });
});
