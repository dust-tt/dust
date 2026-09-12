import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { archiveBaseName, recorderFolderName, sanitizeFilenamePart } from "../src/filenames.ts";
import { makeRecording } from "./fixtures.ts";

describe("filenames", () => {
  it("sanitizes path characters and whitespace", () => {
    assert.equal(sanitizeFilenamePart("Discovery call with Acme / Q3"), "Discovery-call-with-Acme-Q3");
    assert.equal(sanitizeFilenamePart(""), "untitled");
  });

  it("groups archives by recorder email", () => {
    assert.equal(recorderFolderName(makeRecording()), "ilias@dust.tt");
    assert.equal(
      recorderFolderName(makeRecording({ recorder: { ...makeRecording().recorder, email: "" } })),
      "_unknown"
    );
  });

  it("keeps the recording id in the file stem", () => {
    assert.equal(
      archiveBaseName(makeRecording()),
      "2026-09-12_Discovery-call-with-Acme-Q3_rec_abc123"
    );
  });
});
