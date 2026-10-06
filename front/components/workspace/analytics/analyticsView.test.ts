import { describeAnalyticsView } from "@app/components/workspace/analytics/analyticsView";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { describe, expect, it } from "vitest";

describe("describeAnalyticsView", () => {
  it("stays in English when the UI locale is French", async () => {
    i18n.loadAndActivate({
      locale: "fr-FR",
      messages: await loadCatalog("fr-FR"),
    });

    expect(
      describeAnalyticsView({
        dimension: "api_key",
        filter: {
          member: [
            {
              kind: "member",
              id: "usr",
              name: "Nath",
              image: null,
              disabled: false,
            },
          ],
        },
        granularity: "week",
        period: { kind: "days", days: 30 },
      })
    ).toBe(
      [
        "Period: Last 30 days",
        "Granularity: Weekly",
        "Breakdown: API keys",
        "Filters: Member: Nath",
      ].join("\n")
    );
  });
});
