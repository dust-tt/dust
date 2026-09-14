import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseReviewRequests } from "./review-bot.ts";

describe("parseReviewRequests", () => {
  it("collects consecutive mentions after r?", () => {
    assert.deepEqual(parseReviewRequests("r? @spolu @flvndvd"), [
      {
        line: "r? @spolu @flvndvd",
        reviewers: ["spolu", "flvndvd"],
        contractReview: false,
      },
    ]);
  });

  it("collects mentions separated by prose such as or", () => {
    assert.deepEqual(parseReviewRequests("r? @pmilliotte or @Nils-Fedrigo"), [
      {
        line: "r? @pmilliotte or @Nils-Fedrigo",
        reviewers: ["pmilliotte", "nils-fedrigo"],
        contractReview: false,
      },
    ]);
  });

  it("collects mentions that appear after leading prose", () => {
    assert.deepEqual(
      parseReviewRequests("r? please review @spolu and @flvndvd thanks"),
      [
        {
          line: "r? please review @spolu and @flvndvd thanks",
          reviewers: ["spolu", "flvndvd"],
          contractReview: false,
        },
      ]
    );
  });

  it("recognizes bare cc anywhere on the request line", () => {
    assert.deepEqual(parseReviewRequests("r? @spolu please cc @flvndvd"), [
      {
        line: "r? @spolu please cc @flvndvd",
        reviewers: ["spolu", "flvndvd"],
        contractReview: true,
      },
    ]);
  });

  it("treats @cc as a GitHub mention, not contract review", () => {
    assert.deepEqual(parseReviewRequests("r? @cc please"), [
      {
        line: "r? @cc please",
        reviewers: ["cc"],
        contractReview: false,
      },
    ]);
  });

  it("deduplicates handles case-insensitively", () => {
    assert.deepEqual(parseReviewRequests("r? @Spolu or @spolu"), [
      {
        line: "r? @Spolu or @spolu",
        reviewers: ["spolu"],
        contractReview: false,
      },
    ]);
  });

  it("ignores team mentions and invalid tokens", () => {
    assert.deepEqual(
      parseReviewRequests("r? @dust-tt/eng or @spolu @not_valid"),
      [
        {
          line: "r? @dust-tt/eng or @spolu @not_valid",
          reviewers: ["spolu"],
          contractReview: false,
        },
      ]
    );
  });

  it("skips fenced code blocks", () => {
    assert.deepEqual(parseReviewRequests("```\nr? @spolu\n```\nr? @flvndvd"), [
      {
        line: "r? @flvndvd",
        reviewers: ["flvndvd"],
        contractReview: false,
      },
    ]);
  });
});
