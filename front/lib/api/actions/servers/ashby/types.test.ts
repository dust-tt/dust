import { AshbyReportSynchronousResponseSchema } from "@app/lib/api/actions/servers/ashby/types";
import { describe, expect, it } from "vitest";

describe("AshbyReportSynchronousResponseSchema", () => {
  it("accepts a failed inline report with URL-shaped report data", () => {
    const result = AshbyReportSynchronousResponseSchema.safeParse({
      requestId: "request-id",
      status: "failed",
      reportData: {
        url: "https://example.com/report.csv",
        metadata: {
          updatedAt: "2026-09-04T10:00:00.000Z",
          title: "Candidates",
        },
      },
      failureReason: "ReportTooLargeForInline",
    });

    expect(result.success).toBe(true);
  });

  it("continues to accept a failed report without report data", () => {
    const result = AshbyReportSynchronousResponseSchema.safeParse({
      requestId: "request-id",
      status: "failed",
      reportData: null,
      failureReason: "ReportGenerationFailed",
    });

    expect(result.success).toBe(true);
  });
});
