import { sortEndpointsByPreferredRegion } from "@app/lib/llms/utils/sort_endpoints";
import { EUROPE, GLOBAL, US } from "@app/lib/model_constructors/types/regions";
import { describe, expect, it } from "vitest";

type TestEndpoint = {
  id: string;
  region: typeof EUROPE | typeof US | typeof GLOBAL;
};

describe("sortEndpointsByPreferredRegion", () => {
  it("puts the endpoint matching the preferred region first", () => {
    const endpoints: TestEndpoint[] = [
      { id: "us", region: US },
      { id: "global", region: GLOBAL },
      { id: "eu", region: EUROPE },
    ];

    const sorted = sortEndpointsByPreferredRegion(endpoints, EUROPE);

    expect(sorted[0]).toEqual({ id: "eu", region: EUROPE });
  });

  it("moves all preferred-region endpoints ahead of the others", () => {
    const endpoints: TestEndpoint[] = [
      { id: "us", region: US },
      { id: "eu-1", region: EUROPE },
      { id: "global", region: GLOBAL },
      { id: "eu-2", region: EUROPE },
    ];

    const sorted = sortEndpointsByPreferredRegion(endpoints, EUROPE);

    expect(sorted.map((e) => e.region)).toEqual([EUROPE, EUROPE, US, GLOBAL]);
  });

  it("preserves the relative order of matching endpoints (stable sort)", () => {
    const endpoints: TestEndpoint[] = [
      { id: "eu-1", region: EUROPE },
      { id: "eu-2", region: EUROPE },
      { id: "us", region: US },
    ];

    const sorted = sortEndpointsByPreferredRegion(endpoints, EUROPE);

    expect(sorted.map((e) => e.id)).toEqual(["eu-1", "eu-2", "us"]);
  });

  it("preserves the relative order of non-matching endpoints (stable sort)", () => {
    const endpoints: TestEndpoint[] = [
      { id: "us", region: US },
      { id: "global", region: GLOBAL },
      { id: "eu", region: EUROPE },
    ];

    const sorted = sortEndpointsByPreferredRegion(endpoints, EUROPE);

    expect(sorted.map((e) => e.id)).toEqual(["eu", "us", "global"]);
  });

  it("keeps the original order when no endpoint matches", () => {
    const endpoints: TestEndpoint[] = [
      { id: "us", region: US },
      { id: "global", region: GLOBAL },
    ];

    const sorted = sortEndpointsByPreferredRegion(endpoints, EUROPE);

    expect(sorted.map((e) => e.id)).toEqual(["us", "global"]);
  });

  it("keeps the original order when every endpoint matches", () => {
    const endpoints: TestEndpoint[] = [
      { id: "eu-1", region: EUROPE },
      { id: "eu-2", region: EUROPE },
    ];

    const sorted = sortEndpointsByPreferredRegion(endpoints, EUROPE);

    expect(sorted.map((e) => e.id)).toEqual(["eu-1", "eu-2"]);
  });

  it("returns an empty array for no endpoints", () => {
    expect(sortEndpointsByPreferredRegion([], GLOBAL)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const endpoints: TestEndpoint[] = [
      { id: "us", region: US },
      { id: "eu", region: EUROPE },
    ];

    sortEndpointsByPreferredRegion(endpoints, EUROPE);

    expect(endpoints.map((e) => e.id)).toEqual(["us", "eu"]);
  });
});
