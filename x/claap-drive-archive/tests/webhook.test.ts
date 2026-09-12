import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractRecordingId,
  isClaapWebhookEvent,
  verifyClaapWebhookSecret,
} from "../src/webhook.ts";
import { makeRecording } from "./fixtures.ts";

const secret = "claap_webhook_secret";

describe("webhook", () => {
  it("accepts a matching Claap webhook secret", () => {
    assert.equal(
      verifyClaapWebhookSecret({ "x-claap-webhook-secret": secret }, secret),
      true
    );
  });

  it("rejects a missing or mismatched secret", () => {
    assert.equal(verifyClaapWebhookSecret({}, secret), false);
    assert.equal(
      verifyClaapWebhookSecret({ "x-claap-webhook-secret": "nope" }, secret),
      false
    );
    assert.equal(
      verifyClaapWebhookSecret({ "x-claap-webhook-secret": secret }, ""),
      false
    );
  });

  it("reads the recording id from a recording_added payload", () => {
    const body = {
      eventId: "evt_1",
      event: { type: "recording_added" as const, recording: makeRecording() },
    };
    assert.equal(isClaapWebhookEvent(body), true);
    assert.equal(extractRecordingId(body), "rec_abc123");
  });

  it("rejects payloads without a recording id", () => {
    assert.equal(isClaapWebhookEvent({ hello: "world" }), false);
    assert.equal(extractRecordingId({ hello: "world" }), null);
  });
});
