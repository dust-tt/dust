import assert from "node:assert/strict";
import test from "node:test";

import { parseReviewRequests } from "./review-bot.ts";

test("parses GitHub handles anywhere in a review request line", () => {
  assert.deepEqual(parseReviewRequests("r? please ask @Nils-Fedrigo and @fabien."), [
    {
      line: "r? please ask @Nils-Fedrigo and @fabien.",
      reviewers: ["nils-fedrigo", "fabien"],
      contractReview: false,
    },
  ]);
});

test("parses handles next to punctuation and preserves contract review tokens", () => {
  assert.deepEqual(parseReviewRequests("r? @nils, please ask @fabien; cc"), [
    {
      line: "r? @nils, please ask @fabien; cc",
      reviewers: ["nils", "fabien"],
      contractReview: true,
    },
  ]);
});

test("does not parse mentions from lines without an r? request", () => {
  assert.deepEqual(parseReviewRequests("Please ask @nils to review this."), []);
});
