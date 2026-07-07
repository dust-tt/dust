import { ZendeskSearchResponseSchema } from "@app/lib/api/actions/servers/zendesk/types";
import { describe, expect, it } from "vitest";

describe("ZendeskSearchResponseSchema", () => {
  it("accepts ticket search results without a group_id", () => {
    const result = ZendeskSearchResponseSchema.safeParse({
      results: [
        {
          id: 123,
          url: "https://dust.zendesk.com/api/v2/tickets/123.json",
          created_at: "2026-07-07T10:00:00Z",
          updated_at: "2026-07-07T10:30:00Z",
          tags: [],
        },
      ],
      count: 1,
      next_page: null,
      previous_page: null,
    });

    expect(result.success).toBe(true);
  });
});
