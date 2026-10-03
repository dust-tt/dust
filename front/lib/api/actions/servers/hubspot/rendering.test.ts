import { formatHubSpotSearchResponse } from "@app/lib/api/actions/servers/hubspot/rendering";
import type { SimplePublicObject } from "@hubspot/api-client/lib/codegen/crm/objects/models/SimplePublicObject";
import { describe, expect, it } from "vitest";

function makeObject(
  id: string,
  properties: Record<string, string | null>
): SimplePublicObject {
  return {
    id,
    properties,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
}

describe("formatHubSpotSearchResponse", () => {
  it("keeps the existing result keys and exposes the pagination cursor", () => {
    const payload = formatHubSpotSearchResponse({
      objects: [
        makeObject("1", {
          firstname: "Ada",
          lastname: "Lovelace",
          createdate: "2026-01-01",
          lastmodifieddate: "2026-01-02",
        }),
      ],
      objectType: "contacts",
      after: "cursor-42",
    });

    expect(payload.results).toEqual([
      {
        id: "1",
        type: "contacts",
        title: "Ada Lovelace",
        url: undefined,
        properties: {
          firstname: "Ada",
          lastname: "Lovelace",
          createdate: "2026-01-01",
          lastmodifieddate: "2026-01-02",
        },
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
    ]);
    expect(payload.paging).toEqual({ after: "cursor-42" });
  });

  it("omits paging on the last page", () => {
    const payload = formatHubSpotSearchResponse({
      objects: [makeObject("1", { name: "Acme" })],
      objectType: "companies",
    });

    expect(payload.results).toHaveLength(1);
    expect(payload).not.toHaveProperty("paging");
  });

  it("returns an empty results array without paging when nothing matches", () => {
    const payload = formatHubSpotSearchResponse({
      objects: [],
      objectType: "deals",
    });

    expect(payload).toEqual({ results: [] });
  });
});
