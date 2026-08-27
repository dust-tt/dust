import { toConsumptionTopRows } from "@app/hooks/useConsumptionTop";
import type { GetConsumptionTopReasoningEffortsResponse } from "@app/lib/api/analytics/consumption/top_reasoning_efforts";
import { describe, expect, it } from "vitest";

describe("toConsumptionTopRows", () => {
  it("normalizes reasoning-effort rankings", () => {
    const response: GetConsumptionTopReasoningEffortsResponse = {
      period: {
        startDate: "2026-07-01T00:00:00.000Z",
        endDate: "2026-08-01T00:00:00.000Z",
      },
      totalCredits: 100,
      totalCount: 1,
      hasMore: false,
      reasoningEfforts: [
        {
          reasoningEffort: "high",
          name: "High",
          credits: 60,
          previousCredits: 40,
          messageCount: 3,
          avgCreditsPerMessage: 20,
        },
      ],
    };

    expect(toConsumptionTopRows(response)).toEqual([
      {
        id: "high",
        name: "High",
        pictureUrl: null,
        description: null,
        icon: null,
        modelId: null,
        modelDisplayName: null,
        credits: 60,
        avgCredits: 20,
        previousCredits: 40,
      },
    ]);
  });
});
